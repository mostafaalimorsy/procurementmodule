import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { KNOWN_PROBLEM_CODES, knownProductProblem } from '../../core/localization/product-problem';
import { DecisionStep, DecisionWorkspace } from './decision.api';
import { DecisionPage } from './decision-page';
import { exceedsEstimate } from './decision-controls';
import {
  FULL_DECISION_ACCESS,
  award,
  candidate,
  controls,
  decision,
  pending,
  recommendation,
  submission,
} from './decision.fixtures';

/** CF-015: every tender page also reads its stage header; the header is not what these tests are about. */
function verifyAll(http: HttpTestingController): void {
  http.match((request) => request.url.endsWith('/stage')).forEach((request) => request.flush(null));
  http.verify();
}

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ');
const button = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll('button')].find((candidate) => text(candidate).includes(label)) as
    HTMLButtonElement | undefined;
const settle = () => new Promise((resolve) => setTimeout(resolve));

function configure(tab: string | null = null, permissions: readonly string[] = ['Decision.View']) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ id: 't1' }) },
          queryParamMap: of(convertToParamMap(tab ? { tab } : {})),
        },
      },
    ],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({
    userId: 'u1',
    tenantId: 't',
    roles: ['ProcurementManager'],
    permissions,
  });
  return TestBed.inject(HttpTestingController);
}

function render(
  view: DecisionWorkspace,
  tab: string | null = null,
  permissions: readonly string[] = ['Decision.View'],
) {
  const http = configure(tab, permissions);
  const page = TestBed.createComponent(DecisionPage);
  page.detectChanges();
  http.expectOne('/api/v1/tenders/t1/decision').flush(view);
  page.detectChanges();
  return { http, page, element: page.nativeElement as HTMLElement };
}

describe('Part 10 problem codes', () => {
  it('explains every decision, negotiation and award refusal with its parameters', () => {
    for (const code of [
      'negotiation.not_ready',
      'negotiation.response_closed',
      'recommendation.not_ready',
      'recommendation.stale',
      'decision.override_reason_required',
      'decision.approver_role_required',
      'approval_rule.invalid',
      'award.already_awarded',
      'tender.awarded_read_only',
    ])
      expect(KNOWN_PROBLEM_CODES).toContain(code);
    expect(
      knownProductProblem({
        code: 'negotiation.not_ready',
        parameters: { reason: 'evaluation_refresh_required' },
      }),
    ).toContain("last round's responses");
    expect(
      knownProductProblem({
        code: 'negotiation.response_closed',
        parameters: { reason: 'deadline_passed' },
      }),
    ).toContain('deadline of this round has passed');
    expect(
      knownProductProblem({
        code: 'recommendation.stale',
        parameters: { reason: 'policy_changed' },
      }),
    ).toContain('the policy changed');
    expect(
      knownProductProblem({
        code: 'decision.approver_role_required',
        parameters: { role: 'ApproverDirector', step: '2' },
      }),
    ).toContain('Approver / Director');
    expect(
      knownProductProblem({
        code: 'negotiation.deadline_invalid',
        parameters: { hours: '1', days: '90' },
      }),
    ).toContain('90');
  });
});

describe('The reserved approval rule name (red-team Y)', () => {
  it('explains approval_rule.name_reserved apart from a name already taken', () => {
    expect(KNOWN_PROBLEM_CODES).toContain('approval_rule.name_reserved');
    expect(
      knownProductProblem({ code: 'approval_rule.name_reserved', parameters: { name: 'default' } }),
    ).toBe('The name “default” is reserved for the route used when no rule matches.');
  });
});

describe('Award outcome (CF-046)', () => {
  const actions = {
    recordResponse: true,
    recordDecline: true,
    requestWithdrawal: true,
    decideWithdrawal: false,
    closeForRetender: false,
    promoteNext: false,
  };

  it('records a decline with its evidence and reason, then offers the next governed decision and the re-tender', async () => {
    const issued = award({
      sequence: 1,
      state: 'AwaitingResponse',
      response: null,
      withdrawals: [],
      actions,
    });
    const { element, http, page } = render(decision({ status: 'Awarded', award: issued }), 'award');
    expect(text(element)).toContain("Awaiting the subcontractor's answer");
    button(element, 'Record a decline')!.click();
    page.detectChanges();
    await settle();
    page.detectChanges();
    button(element, 'Confirm')!.click();
    page.detectChanges();
    http.expectNone('/api/v1/tenders/t1/award/response');
    expect(text(element)).toContain('Explain the reason');
    const fill = (selector: string, value: string, event = 'input') => {
      const field = element.querySelector(selector) as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new Event(event));
    };
    fill('#award-evidence', 'Email 12 Oct');
    fill('#award-outcome-text', 'Crew committed to another project');
    fill('#award-decline-reason', 'Capacity', 'change');
    page.detectChanges();
    button(element, 'Confirm')!.click();
    const request = http.expectOne('/api/v1/tenders/t1/award/response');
    expect(request.request.body).toEqual(
      expect.objectContaining({
        outcome: 'Declined',
        evidenceReference: 'Email 12 Oct',
        reasonCategory: 'Capacity',
        reason: 'Crew committed to another project',
        requestKey: expect.any(String),
      }),
    );
    request.flush(
      decision({
        status: 'Draft',
        award: award({
          sequence: 1,
          state: 'Declined',
          response: {
            outcome: 'Declined',
            respondedOn: '2026-10-12',
            evidenceReference: 'Email 12 Oct',
            reasonCategory: 'Capacity',
            reason: 'Crew committed to another project',
            recordedByName: 'Pam PM',
            recordedAtUtc: '2026-10-12T09:00:00Z',
          },
          withdrawals: [],
          actions: {
            ...actions,
            recordResponse: false,
            recordDecline: false,
            requestWithdrawal: false,
            closeForRetender: true,
            promoteNext: true,
          },
        }),
      }),
    );
    page.detectChanges();
    expect(text(element)).toContain('Declined by the subcontractor');
    expect(text(element)).toContain('only through a new decision and its approvals');
    expect(button(element, 'Close the tender to re-tender')).toBeDefined();
    expect(button(element, 'Record acceptance')).toBeUndefined();
  });
});

describe('Outcome notices (CF-047 / CF-131)', () => {
  it('lets the award choose when the others are told and which reserves hear they are held in reserve', () => {
    const approved = pending({
      status: 'Approved',
      currentSubmission: submission({ outcome: 'Approved' }),
    });
    const { element, http, page } = render(approved, 'approval');
    button(element, 'Issue the award')!.click();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(dialog)).toContain('When the other firms are told');
    expect(text(dialog)).toContain('Tell these reserves they are held in reserve');
    expect(text(dialog)).toContain('ACME-01');
    (dialog.querySelector('input[value="AtAward"]') as HTMLInputElement).click();
    // The reserve, then the confirmation.
    (dialog.querySelector('fieldset input[type="checkbox"]') as HTMLInputElement).click();
    (dialog.querySelector('input[name="awardConfirmed"]') as HTMLInputElement).click();
    page.detectChanges();
    button(dialog, 'Issue the award')!.click();
    const request = http.expectOne('/api/v1/tenders/t1/award');
    expect(request.request.body).toEqual(
      expect.objectContaining({ noticeTiming: 'AtAward', notifyReserves: ['b1'] }),
    );
    request.flush(approved);
  });

  it("shows each firm's notice and sends the held ones early only after a confirmation", () => {
    const issued = award({
      sequence: 1,
      state: 'AwaitingResponse',
      response: null,
      withdrawals: [],
      noticeTiming: 'OnAcceptance',
      notices: [
        {
          openingBidId: 'b2',
          subcontractorCode: 'BETA-01',
          disposition: 'Award',
          kind: 'AwardSelected',
          status: 'Sent',
        },
        {
          openingBidId: 'b1',
          subcontractorCode: 'ACME-01',
          disposition: 'Reserve',
          kind: null,
          status: null,
        },
        {
          openingBidId: 'b3',
          subcontractorCode: 'GAMA-01',
          disposition: 'Reject',
          kind: 'AwardNotSelected',
          status: 'Held',
        },
      ],
      actions: {
        recordResponse: true,
        recordDecline: true,
        requestWithdrawal: true,
        decideWithdrawal: false,
        closeForRetender: false,
        promoteNext: false,
        releaseNotices: true,
        releaseReserves: true,
      },
    });
    const { element, http, page } = render(decision({ status: 'Awarded', award: issued }), 'award');
    const shown = text(element);
    expect(shown).toContain('Outcome notices to the firms');
    expect(shown).toContain('Held until the award is accepted');
    expect(shown).toContain('Not told yet');
    button(element, 'Send the held notices now')!.click();
    page.detectChanges();
    http.expectNone('/api/v1/tenders/t1/award/notices/release');
    expect(text(element)).toContain('before the awarded firm has answered');
    button(element, 'Confirm')!.click();
    http
      .expectOne('/api/v1/tenders/t1/award/notices/release')
      .flush(decision({ status: 'Awarded', award: issued }));
    page.detectChanges();
    button(element, 'Tell the reserves they were not selected')!.click();
    page.detectChanges();
    button(element, 'Confirm')!.click();
    http
      .expectOne('/api/v1/tenders/t1/award/reserves/release')
      .flush(decision({ status: 'Awarded', award: issued }));
  });

  it('explains a reserve choice the server refused', () => {
    expect(knownProductProblem({ code: 'award.notices_invalid' })).toContain('Only reserve bids');
  });
});

describe('Where the decision stands (CF-008)', () => {
  const cases: readonly [DecisionWorkspace['status'], DecisionStep, string][] = [
    [
      null,
      { state: 'NoDecision', ownerRole: 'ProcurementManager', stepNumber: null },
      'No decision prepared yet — owner: Procurement Manager',
    ],
    [
      'Draft',
      { state: 'Returned', ownerRole: 'ProcurementManager', stepNumber: null },
      'Returned for changes — revise it',
    ],
    [
      'Draft',
      { state: 'Rejected', ownerRole: 'ProcurementManager', stepNumber: null },
      'Proposal rejected — prepare it again',
    ],
    [
      'PendingApproval',
      { state: 'AwaitingApproval', ownerRole: 'ApproverDirector', stepNumber: 2 },
      'Waiting for approval step 2 — role: Approver / Director',
    ],
    [
      'Approved',
      { state: 'Approved', ownerRole: 'ProcurementManager', stepNumber: null },
      'Approved — the award is to be issued',
    ],
    ['Awarded', { state: 'Awarded', ownerRole: null, stepNumber: null }, 'Awarded'],
  ];

  it('states the decision step beside the evidence readiness, never "ready for a recommendation" once it is submitted', () => {
    for (const [status, currentStep, expected] of cases) {
      const { element } = render(decision({ status, currentStep }));
      const shown = text(element);
      expect(shown).toContain(expected);
      if (status === 'PendingApproval' || status === 'Approved' || status === 'Awarded') {
        expect(shown).not.toContain('Ready for a recommendation');
        expect(shown).toContain('Evidence current');
      }
      TestBed.resetTestingModule();
    }
  });

  it('offers the award to a reader who may issue it, and names the role to anyone else', () => {
    const approved = { status: 'Approved' as const, currentStep: cases[4][1] };
    const { element, page } = render(decision(approved));
    button(element, 'Go to the award')!.click();
    page.detectChanges();
    expect(page.componentInstance.tab()).toBe('award');
    TestBed.resetTestingModule();
    const other = render(
      decision({ ...approved, access: { ...FULL_DECISION_ACCESS, issue: false } }),
    );
    expect(button(other.element, 'Go to the award')).toBeUndefined();
    expect(text(other.element)).toContain('owner: Procurement Manager');
  });
});

describe('Overdue negotiation round (CF-010)', () => {
  it('says a round past its deadline must be closed, not the generic "still open" copy', () => {
    const { element, http } = render(
      decision({
        readiness: { state: 'NegotiationOpen', gaps: ['negotiation_deadline_passed'] },
      }),
    );
    const note = element.querySelector('.tnd-attention-box[role="note"]') as HTMLElement;
    expect(note).not.toBeNull();
    expect(text(note)).toContain('Before a recommendation can be computed');
    expect(text(note)).toContain(
      'A negotiation round is past its response deadline and still open. Close it to take its responses in.',
    );
    expect(text(element)).not.toContain(
      'A negotiation round is still open. Close or cancel it first.',
    );
    verifyAll(http);
  });
});

describe('Decision workspace', () => {
  it('shows an empty state, not an error, before the bids are opened', () => {
    const http = configure();
    const page = TestBed.createComponent(DecisionPage);
    page.detectChanges();
    http
      .expectOne('/api/v1/tenders/t1/decision')
      .flush({ code: 'opening.not_opened' }, { status: 409, statusText: 'Conflict' });
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    expect(text(element)).toContain('No decision yet');
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('ranks by recommendation rank — never a winner — with current and historical evidence apart', () => {
    const { element, http } = render(decision(), 'recommendation');
    const shown = text(element);
    expect(shown).toContain('Recommendation rank 1');
    expect(shown).toContain('Recommendation rank 2');
    expect(shown).not.toMatch(/winner/i);
    // History is unavailable: its weight is not applied and confidence is reduced, in words.
    expect(shown).toContain('Historical performance: unavailable');
    expect(shown).toContain('20% weight not applied, confidence reduced');
    expect(shown).toContain('Insufficient history');
    // Ineligible firms are listed apart, with the reason.
    expect(shown).toContain("Technical score below the policy's pass mark.");
    const breakdown = element.querySelector('.dc-breakdown') as HTMLElement;
    const headings = [...breakdown.querySelectorAll('h4')].map((heading) => text(heading).trim());
    expect(headings).toEqual(['Current evidence (this tender)', 'Historical performance']);
    const [current, historical] = [...breakdown.querySelectorAll('table')];
    expect(text(current)).toContain('Commercial (leveled price)');
    expect(text(current)).not.toContain('Past performance');
    expect(text(historical)).toContain('Past performance (history)');
    expect(text(historical)).toContain('Unavailable — weight not applied');
    // CF-018: the fingerprint is whole, isolated left-to-right, and collapsed under "Verification details".
    const details = element.querySelector('app-verification-details details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const code = details.querySelector('code.dc-mono') as HTMLElement;
    expect(code.getAttribute('dir')).toBe('ltr');
    expect(code.textContent?.trim()).toMatch(/^f{12,}$/);
    verifyAll(http);
  });

  it('labels the past outcomes of a candidate as not system-evidenced and never weighed', () => {
    // CF-002 (ADR-126): read now beside the candidate; the recommendation is untouched.
    const base = decision();
    const rec = base.recommendation!;
    const { element, http } = render(
      decision({
        recommendation: {
          ...rec,
          candidates: [
            { ...rec.candidates[0], retrospectiveProjects: 2 },
            ...rec.candidates.slice(1),
          ],
        },
      }),
      'recommendation',
    );
    const shown = text(element.querySelector('[data-testid="retrospective-count"]')!);
    expect(shown).toContain('Retrospective — not system-evidenced');
    expect(shown).toContain(
      '2 past outcomes in this category — not weighed by this recommendation',
    );
    expect(element.querySelectorAll('[data-testid="retrospective-count"]').length).toBe(1);
    verifyAll(http);
  });

  it('names the history rule a recommendation used and flags firms below the minimum or given the neutral value', () => {
    // CF-021 / CF-022 (ADR-127).
    const base = decision();
    const rec = base.recommendation!;
    const { element, http } = render(
      decision({
        recommendation: {
          ...rec,
          historyRule: 'partial-v2',
          neutralHistoryScore: 55,
          candidates: [
            { ...rec.candidates[0], flags: ['history_below_minimum', 'history_neutral'] },
            ...rec.candidates.slice(1),
          ],
        },
      }),
      'recommendation',
    );
    expect(text(element.querySelector('[data-testid="history-rule"]')!)).toContain(
      'the others receive the neutral value 55',
    );
    const shown = text(element);
    expect(shown).toContain('below the minimum of 2, not a history yet');
    expect(shown).toContain("the policy's neutral value was used");
    verifyAll(http);
  });

  it('never shows a stale recommendation as ready and blocks preparing on it', () => {
    const stale = decision({
      recommendation: recommendation({
        liveState: 'RecomputeRequired',
        staleReason: 'policy_changed',
      }),
    });
    const { element, page } = render(stale, 'recommendation');
    const chip = element.querySelector('#recommendation-title .prj-chip') as HTMLElement;
    expect(text(chip)).toContain('Recompute required (the policy changed)');
    expect(text(chip)).not.toMatch(/^\s*Ready/);
    expect(text(element)).toContain('This recommendation is not current');
    page.componentInstance.selectTab('decision');
    page.detectChanges();
    expect(text(element)).toContain('The recommendation is not current. Compute it again');
    expect(element.querySelector('#decision-proposed')).toBeNull();
  });

  it('computes with the chosen policy and keeps the request key for a retry', () => {
    const { element, http, page } = render(
      decision({ recommendation: null, recommendationHistory: [] }),
      'recommendation',
    );
    button(element, 'Compute recommendation')!.click();
    const first = http.expectOne('/api/v1/tenders/t1/decision/recommendations');
    expect(first.request.body.policyId).toBe('pol1');
    first.flush({ code: 'x' }, { status: 503, statusText: 'Unavailable' });
    page.detectChanges();
    button(element, 'Compute recommendation')!.click();
    const retry = http.expectOne('/api/v1/tenders/t1/decision/recommendations');
    expect(retry.request.body.requestKey).toBe(first.request.body.requestKey);
    retry.flush(decision());
    page.detectChanges();
    expect(text(element)).toContain('Recommendation 1');
  });

  it('asks for a reason to rank with another policy than the declared one and flags the change (CF-040)', () => {
    const { element, http, page } = render(
      decision({
        recommendation: null,
        recommendationHistory: [],
        policyOptions: [
          {
            id: 'pol1',
            name: 'Declared value',
            currentVersionNumber: 2,
            weighsHistory: false,
            declared: true,
            declaredVersionNumber: 1,
          },
          { id: 'pol2', name: 'Price only', currentVersionNumber: 1, weighsHistory: false },
        ],
      }),
      'recommendation',
    );
    expect(text(element)).toContain('Declared value (declared at publication, version 1)');
    const select = element.querySelector('#recommendation-policy') as HTMLSelectElement;
    select.value = 'pol2';
    select.dispatchEvent(new Event('change'));
    page.detectChanges();
    button(element, 'Compute recommendation')!.click();
    page.detectChanges();
    http.expectNone('/api/v1/tenders/t1/decision/recommendations');
    expect(text(element)).toContain('Explain the reason');
    const reason = element.querySelector('#recommendation-deviation') as HTMLTextAreaElement;
    reason.value = 'Board asked for a price-led ranking';
    reason.dispatchEvent(new Event('input'));
    page.detectChanges();
    button(element, 'Compute recommendation')!.click();
    const request = http.expectOne('/api/v1/tenders/t1/decision/recommendations');
    expect(request.request.body).toEqual({
      policyId: 'pol2',
      requestKey: expect.any(String),
      deviationReason: 'Board asked for a price-led ranking',
    });
    request.flush(
      decision({
        recommendation: recommendation({
          criteriaDeclaration: 'deviated',
          declaredPolicyName: 'Declared value',
          declaredPolicyVersionNumber: 1,
          criteriaDeviationReason: 'Board asked for a price-led ranking',
          criteriaChangedAfterOpening: true,
        }),
      }),
    );
    page.detectChanges();
    expect(text(element)).toContain(
      'Criteria changed after opening: the tender declared Declared value (version 1). Reason: Board asked for a price-led ranking',
    );
  });

  it('requires an override reason when the proposed firm is not ranked first', async () => {
    const { element, http, page } = render(decision(), 'decision');
    await settle();
    page.detectChanges();
    const select = element.querySelector('#decision-proposed') as HTMLSelectElement;
    expect(select.value).toBe('b1');
    expect(element.querySelector('#decision-override')).toBeNull();
    // The value is prefilled with the proposed bid's leveled total, as an exact decimal string.
    expect((element.querySelector('#decision-value') as HTMLInputElement).value).toBe(
      '1,800,000.00',
    );

    select.value = 'b2';
    select.dispatchEvent(new Event('change'));
    page.detectChanges();
    await settle();
    page.detectChanges();
    expect(text(element)).toContain('recorded as an override');
    expect(element.querySelector('#decision-override')).not.toBeNull();
    // The value follows the newly proposed bid's leveled total.
    expect((element.querySelector('#decision-value') as HTMLInputElement).value).toBe(
      '1,950,000.00',
    );

    // Save the draft (no decision yet: no version), then try to submit without the reason.
    (element.querySelector('form.dc-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const save = http.expectOne('/api/v1/tenders/t1/decision');
    expect(save.request.method).toBe('PUT');
    expect(save.request.body.version).toBeUndefined();
    expect(save.request.body.proposedOpeningBidId).toBe('b2');
    expect(save.request.body.awardValue).toBe('1950000.00');
    expect(save.request.body.dispositions).toEqual([
      { openingBidId: 'b1', disposition: 'Reject', reserveRank: null, reason: null },
      { openingBidId: 'b3', disposition: 'Reject', reserveRank: null, reason: null },
    ]);
    save.flush(
      decision({
        status: 'Draft',
        decisionVersion: 'dv1',
        draft: {
          recommendationId: 'rec1',
          proposedOpeningBidId: 'b2',
          isOverride: true,
          overrideReason: null,
          awardValue: '1950000.00',
          valueReason: null,
          rationale: null,
          dispositions: [],
          suggestedAwardValue: '1950000.00',
          updatedAtUtc: '2026-10-07T11:00:00Z',
          preparedByName: 'Maha Manager',
          competitionCategory: null,
          competitionReason: null,
          overBudgetReason: null,
        },
        routePreview: submission().route,
      }),
    );
    page.detectChanges();
    await settle();
    page.detectChanges();
    expect(text(element)).toContain('Step 1: Approver / Director');
    expect(text(element)).toContain('Step 2: Any approver');
    button(element, 'Submit for approval')!.click();
    page.detectChanges();
    expect(text(element)).toContain('Explain why a firm not ranked first is proposed');
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    verifyAll(http);
  });

  it('offers only first-ranked firms without the override right', async () => {
    const { element, page } = render(
      decision({ access: { ...FULL_DECISION_ACCESS, override: false } }),
      'decision',
    );
    await settle();
    page.detectChanges();
    const options = [...(element.querySelector('#decision-proposed') as HTMLSelectElement).options];
    expect(options.map((option) => option.value)).toEqual(['b1']);
    expect(text(element)).toContain('Proposing another firm needs the override right');
  });

  it('explains why an approver cannot act and offers no approval actions', () => {
    const { element } = render(pending({ approvalBlocker: 'self_approval' }), 'approval');
    expect(text(element)).toContain('the approval rule does not allow self-approval');
    expect(button(element, 'Approve')).toBeUndefined();
    // The override and its reason go with the version the approver sees.
    expect(text(element)).toContain('Overrides the recommendation');
    expect(text(element)).toContain('Stronger site team');
    // Approved steps say who approved; open steps say they are waiting.
    expect(text(element)).toContain('Approved by Dana Director');
    expect(text(element)).toContain('Waiting');
    // A bid's "not selected" outcome is not an approver rejecting the proposal.
    expect(text(element)).toContain('Not selected (bid rejected)');
    expect(text(element)).toContain('Reserve, order 1');
  });

  it('returns for changes only with a comment, sending the version and a request key', () => {
    const { element, http, page } = render(pending(), 'approval');
    expect(button(element, 'Reject the proposal')).toBeDefined();
    button(element, 'Return for changes')!.click();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    button(dialog, 'Return for changes')!.click();
    page.detectChanges();
    expect(text(dialog)).toContain('Write a comment for the record');
    http.expectNone('/api/v1/tenders/t1/decision/approvals');
    const comment = dialog.querySelector('textarea') as HTMLTextAreaElement;
    comment.value = 'Clarify the programme risk';
    comment.dispatchEvent(new Event('input'));
    button(dialog, 'Return for changes')!.click();
    const request = http.expectOne('/api/v1/tenders/t1/decision/approvals');
    expect(request.request.body).toEqual({
      kind: 'Return',
      comment: 'Clarify the programme risk',
      version: 'dv2',
      requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    request.flush(decision({ status: 'Draft', decisionVersion: 'dv3' }));
  });

  it('issues the award only after an explicit confirmation, retrying with the same key', () => {
    const approved = pending({
      status: 'Approved',
      currentSubmission: submission({ outcome: 'Approved' }),
    });
    const { element, http, page } = render(approved, 'approval');
    // Approval is not award: the award is its own act.
    expect(button(element, 'Approve')).toBeUndefined();
    button(element, 'Issue the award')!.click();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(dialog)).toContain('frozen and can never change');
    button(dialog, 'Issue the award')!.click();
    page.detectChanges();
    expect(text(dialog)).toContain('Tick the confirmation');
    http.expectNone('/api/v1/tenders/t1/award');
    const box = dialog.querySelector('input[name="awardConfirmed"]') as HTMLInputElement;
    box.click();
    page.detectChanges();
    button(dialog, 'Issue the award')!.click();
    const first = http.expectOne('/api/v1/tenders/t1/award');
    expect(first.request.body.confirmed).toBe(true);
    expect(first.request.body.version).toBe('dv2');
    // CF-047: nothing chosen keeps the company's notice timing; no reserve is told.
    expect(first.request.body.noticeTiming).toBeUndefined();
    expect(first.request.body.notifyReserves).toBeUndefined();
    first.flush(null, { status: 0, statusText: 'Network' });
    page.detectChanges();
    button(dialog, 'Issue the award')!.click();
    const retry = http.expectOne('/api/v1/tenders/t1/award');
    expect(retry.request.body.requestKey).toBe(first.request.body.requestKey);
    retry.flush(approved);
  });

  it('shows the immutable award baseline with its verified fingerprint and every outcome', () => {
    const { element } = render(
      pending({
        status: 'Awarded',
        currentSubmission: submission({ outcome: 'Awarded' }),
        award: award(),
      }),
      'award',
    );
    const shown = text(element);
    expect(shown).toContain('Baseline fingerprint verified');
    expect(shown).toContain('Award baseline');
    expect(shown).toContain('Supply and install');
    expect(shown).toContain('Crane hire');
    expect(shown).toContain('Alternative damper brand');
    expect(shown).toContain('Proposed for award');
    expect(shown).toContain('Reserve, order 1');
    expect(shown).toContain('Not selected (bid rejected)');
    const amounts = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) =>
      text(node).trim(),
    );
    expect(amounts).toContain('1,950,000.00 QAR');
    expect(element.querySelector('code')?.textContent).toBe('d'.repeat(64));
  });

  it('names the currency of every amount on the award baseline (CF-098 AC2)', () => {
    const { element } = render(
      pending({
        status: 'Awarded',
        currentSubmission: submission({ outcome: 'Awarded' }),
        award: award(),
      }),
      'award',
    );
    const baseline = element.querySelector('app-award-baseline') as HTMLElement;
    const money = [...baseline.querySelectorAll('dd bdi[dir="ltr"]')]
      .map((node) => text(node).trim())
      .filter((value) => /^\d{1,3}(,\d{3})*\.\d{2}\b/.test(value));
    expect(money).toEqual(expect.arrayContaining(['1,950,000.00 QAR', '1,900,000.00 QAR']));
    for (const value of money) expect(value).toMatch(/ QAR$/);
    const header = [...baseline.querySelectorAll('th')].find((th) => text(th).includes('Amount'))!;
    expect(text(header).trim()).toBe('Amount (QAR)');
    const line = [...baseline.querySelectorAll('td.dc-num bdi')].map((node) => text(node).trim());
    expect(line).toEqual(['1,900,000.00 QAR']);
  });

  it('names the currency of the approval totals (CF-098 AC2)', () => {
    const { element } = render(pending(), 'approval');
    const totals = text(element.querySelector('[data-testid="approval-totals"]') as HTMLElement);
    expect(totals).toMatch(/leveled [\d,.]+ QAR · submitted [\d,.]+ QAR/);
  });

  it('keeps the award baseline fingerprints collapsed and shows each whole hash when opened (CF-100 AC4)', () => {
    const { element } = render(
      pending({
        status: 'Awarded',
        currentSubmission: submission({ outcome: 'Awarded' }),
        award: award(),
      }),
      'award',
    );
    const details = element.querySelector('app-verification-details details') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(text(details.querySelector('summary')!).trim()).toBe('Verification details');
    details.open = true;
    const hashes = [...details.querySelectorAll('code[dir="ltr"]')].map((code) =>
      code.textContent?.trim(),
    );
    expect(hashes).toEqual(['d'.repeat(64), 'c'.repeat(64)]);
    expect(text(details)).toContain('Baseline fingerprint (SHA-256)');
    expect(text(details)).toContain('Bid content fingerprint (SHA-256)');
  });

  it('lists the dated history in the timeline', () => {
    const { element } = render(
      pending({
        timeline: [
          {
            kind: 'recommendation_computed',
            atUtc: '2026-10-07T10:00:00Z',
            actorName: 'Maha Manager',
            number: 1,
            step: null,
          },
          {
            kind: 'decision_submitted',
            atUtc: '2026-10-07T12:00:00Z',
            actorName: 'Maha Manager',
            number: 1,
            step: null,
          },
          {
            kind: 'approved',
            atUtc: '2026-10-08T09:00:00Z',
            actorName: 'Dana Director',
            number: 1,
            step: 1,
          },
        ],
      }),
      'timeline',
    );
    const items = [...element.querySelectorAll('.dc-timeline li')].map((item) => text(item));
    expect(items.length).toBe(3);
    expect(items[1]).toContain('submitted for approval');
    expect(items[2]).toContain('approved (step');
    expect(items[2]).toContain('Dana Director');
  });

  it('still offers return and reject when approving is blocked by a stale recommendation', () => {
    const { element, http, page } = render(
      pending({
        approvalBlocker: 'recommendation_stale',
        recommendation: recommendation({
          liveState: 'RecomputeRequired',
          staleReason: 'evidence_changed',
        }),
      }),
      'approval',
    );
    expect(text(element)).toContain('The recommendation behind this decision is no longer current');
    expect(button(element, 'Approve')).toBeUndefined();
    expect(button(element, 'Return for changes')).toBeDefined();
    button(element, 'Reject the proposal')!.click();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(dialog)).toContain('no bid is rejected by it');
    button(dialog, 'Reject the proposal')!.click();
    page.detectChanges();
    // The required comment is marked invalid and described by the error.
    const comment = dialog.querySelector('#reject-comment') as HTMLTextAreaElement;
    expect(comment.getAttribute('aria-invalid')).toBe('true');
    expect(comment.getAttribute('aria-describedby')).toBe('approval-dialog-error');
    comment.value = 'Recompute on the current evidence';
    comment.dispatchEvent(new Event('input'));
    button(dialog, 'Reject the proposal')!.click();
    const request = http.expectOne('/api/v1/tenders/t1/decision/approvals');
    expect(request.request.body.kind).toBe('Reject');
    expect(request.request.body.comment).toBe('Recompute on the current evidence');
    request.flush(decision({ status: 'Draft', decisionVersion: 'dv3' }));
  });

  it('offers withdrawing only to those who may, with a required reason', () => {
    const hidden = render(
      pending({ access: { ...FULL_DECISION_ACCESS, withdraw: false } }),
      'approval',
    );
    expect(button(hidden.element, 'Withdraw the submission')).toBeUndefined();
    TestBed.resetTestingModule();

    const { element, http, page } = render(pending(), 'approval');
    button(element, 'Withdraw the submission')!.click();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    const reason = dialog.querySelector('#withdraw-comment') as HTMLTextAreaElement;
    expect(reason.getAttribute('aria-required')).toBe('true');
    expect(text(dialog)).toContain('(required)');
    button(dialog, 'Withdraw')!.click();
    page.detectChanges();
    expect(text(dialog)).toContain('Write a comment for the record');
    http.expectNone('/api/v1/tenders/t1/decision/withdraw');
    reason.value = 'Wrong value entered';
    reason.dispatchEvent(new Event('input'));
    button(dialog, 'Withdraw')!.click();
    const request = http.expectOne('/api/v1/tenders/t1/decision/withdraw');
    expect(request.request.body).toEqual({
      reason: 'Wrong value entered',
      version: 'dv2',
      requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    request.flush(decision({ status: 'Draft', decisionVersion: 'dv3' }));
    page.detectChanges();
    expect(text(element)).toContain('The submission was withdrawn');
  });

  it('never awards an approved decision whose recommendation is no longer current', () => {
    const { element } = render(
      pending({
        status: 'Approved',
        currentSubmission: submission({ outcome: 'Approved' }),
        recommendation: recommendation({
          liveState: 'RecomputeRequired',
          staleReason: 'policy_changed',
        }),
      }),
      'approval',
    );
    expect(button(element, 'Issue the award')).toBeUndefined();
    expect(text(element)).toContain('the award cannot be issued');
    expect(button(element, 'Withdraw the submission')).toBeDefined();
  });

  it('keeps the award request key when the approval section is left and reopened', () => {
    const approved = pending({
      status: 'Approved',
      currentSubmission: submission({ outcome: 'Approved' }),
    });
    const { element, http, page } = render(approved, 'approval');
    const issue = () => {
      button(element, 'Issue the award')!.click();
      page.detectChanges();
      const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
      (dialog.querySelector('input[name="awardConfirmed"]') as HTMLInputElement).click();
      page.detectChanges();
      button(dialog, 'Issue the award')!.click();
      return http.expectOne('/api/v1/tenders/t1/award');
    };
    const first = issue();
    first.flush(null, { status: 0, statusText: 'Network' });
    page.detectChanges();
    (element.querySelector('[role="dialog"]') as HTMLElement)
      .querySelector<HTMLButtonElement>('.prj-btn--ghost')!
      .click();
    page.componentInstance.selectTab('overview');
    page.detectChanges();
    page.componentInstance.selectTab('approval');
    page.detectChanges();
    const retry = issue();
    expect(retry.request.body.requestKey).toBe(first.request.body.requestKey);
    retry.flush(approved);
  });

  it('flags a stale rank-one firm on the overview', () => {
    const { element } = render(
      decision({
        recommendation: recommendation({
          liveState: 'RecomputeRequired',
          staleReason: 'policy_changed',
        }),
      }),
    );
    expect(text(element)).toContain('Not current: Recompute required (the policy changed)');
  });
});

describe('Decision controls (ADR-086)', () => {
  it('compares money against the estimate exactly, never in floating point', () => {
    expect(exceedsEstimate('1000000.00', '900000.00', '0')).toBe(true);
    expect(exceedsEstimate('900000.00', '900000.00', '0')).toBe(false);
    expect(exceedsEstimate('1035000.00', '900000.00', '15')).toBe(false);
    expect(exceedsEstimate('1035000.01', '900000.00', '15')).toBe(true);
    expect(exceedsEstimate('0.30', '0.10', '200')).toBe(false);
  });

  it('shows competition, standing and validity as judged by the server, words beside every mark', () => {
    const view = decision({
      controls: controls({
        eligible: 1,
        minimumCompliantBids: 3,
        limitedCompetition: true,
        candidates: [
          controls().candidates[0],
          { ...controls().candidates[1], standing: 'Blocked', validityState: 'Lapsed' },
        ],
      }),
    });
    const { element } = render(view, 'decision');
    const panel = element.querySelector('[aria-labelledby="controls-title"]') as HTMLElement;
    expect(text(panel)).toContain('1 (your company requires 3)');
    expect(text(panel)).toContain('Limited competition');
    expect(text(panel)).toContain('Blocked — must not be engaged');
    expect(text(panel)).toContain('Lapsed');
    expect(text(panel)).toContain('90 days, until');
    // The estimate row appears only when the server sends the estimate.
    expect(text(panel)).toContain('Package estimate');
    expect(text(panel)).toContain('+11.11 %');
  });

  it('says when a package without a category uses no history', () => {
    const { element } = render(
      decision({ controls: controls({ historyCategoryMissing: true }) }),
      'decision',
    );
    expect(text(element)).toContain(
      'This package has no category, so no performance history is used.',
    );
  });

  it('never shows an estimate the server did not send', () => {
    const { element } = render(
      decision({ controls: controls({ estimate: null, estimateCurrency: null }) }),
      'decision',
    );
    const panel = element.querySelector('[aria-labelledby="controls-title"]') as HTMLElement;
    expect(text(panel)).not.toContain('Package estimate');
    expect(text(panel)).not.toContain('against the estimate');
  });

  it('asks for the limited-competition justification and the over-budget reason before submitting, and saves them', async () => {
    const view = decision({
      recommendation: recommendation({ limitedCompetition: true, minimumCompliantBids: 4 }),
      controls: controls({ estimate: '1500000.00', limitedCompetition: true }),
    });
    const { element, http, page } = render(view, 'decision');
    await settle();
    page.detectChanges();
    // 1,800,000.00 is 20 % above the 1,500,000.00 estimate (tolerance 0).
    expect(element.querySelector('#decision-over-budget')).not.toBeNull();
    expect(element.querySelector('#decision-competition-category')).not.toBeNull();
    (element.querySelector('form.dc-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const save = http.expectOne('/api/v1/tenders/t1/decision');
    expect(save.request.body.competitionCategory).toBeNull();
    save.flush(
      decision({
        ...view,
        status: 'Draft',
        decisionVersion: 'dv1',
        draft: {
          recommendationId: 'rec1',
          proposedOpeningBidId: 'b1',
          isOverride: false,
          overrideReason: null,
          awardValue: '1800000.00',
          valueReason: null,
          rationale: null,
          dispositions: [],
          suggestedAwardValue: '1800000.00',
          updatedAtUtc: '2026-10-07T11:00:00Z',
          preparedByName: 'Maha Manager',
          competitionCategory: null,
          competitionReason: null,
          overBudgetReason: null,
        },
      }),
    );
    page.detectChanges();
    await settle();
    page.detectChanges();
    button(element, 'Submit for approval')!.click();
    page.detectChanges();
    expect(text(element)).toContain('Choose why the decision stands with limited competition');
    expect(element.querySelector('[role="dialog"]')).toBeNull();

    const category = element.querySelector('#decision-competition-category') as HTMLSelectElement;
    category.value = category.options[1].value;
    category.dispatchEvent(new Event('change'));
    for (const [id, value] of [
      ['#decision-competition-reason', 'Only three firms hold the licence'],
      ['#decision-over-budget', 'Scope grew after the estimate'],
    ]) {
      const field = element.querySelector(id) as HTMLTextAreaElement;
      field.value = value;
      field.dispatchEvent(new Event('input'));
    }
    page.detectChanges();
    (element.querySelector('form.dc-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const second = http.expectOne('/api/v1/tenders/t1/decision');
    expect(second.request.body.version).toBe('dv1');
    expect(second.request.body.competitionCategory).toBe('SoleCapableFirm');
    expect(second.request.body.competitionReason).toBe('Only three firms hold the licence');
    expect(second.request.body.overBudgetReason).toBe('Scope grew after the estimate');
    verifyAll(http);
  });

  it('sends no over-budget reason within the estimate and no justification with enough competition', async () => {
    const { element, http, page } = render(
      decision({ controls: controls({ estimate: '2000000.00' }) }),
      'decision',
    );
    await settle();
    page.detectChanges();
    expect(element.querySelector('#decision-over-budget')).toBeNull();
    expect(element.querySelector('#decision-competition-category')).toBeNull();
    (element.querySelector('form.dc-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const save = http.expectOne('/api/v1/tenders/t1/decision');
    expect([save.request.body.competitionCategory, save.request.body.overBudgetReason]).toEqual([
      null,
      null,
    ]);
  });

  it('asks why the decision stands on a bid that answered an earlier tender revision and shows approvers the reason (CF-045)', async () => {
    const stale = candidate({ flags: ['older_tender_revision'] });
    const view = decision({ recommendation: recommendation({ candidates: [stale] }) });
    const { element, http, page } = render(view, 'decision');
    await settle();
    page.detectChanges();
    expect(text(element)).toContain('This bid answered an earlier revision of the tender');
    const field = element.querySelector('#decision-revision-ack') as HTMLTextAreaElement;
    field.value = 'The addendum changed access hours only';
    field.dispatchEvent(new Event('input'));
    page.detectChanges();
    (element.querySelector('form.dc-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const save = http.expectOne('/api/v1/tenders/t1/decision');
    expect(save.request.body.revisionAcknowledgementReason).toBe(
      'The addendum changed access hours only',
    );
    TestBed.resetTestingModule();

    const approval = render(
      pending({
        currentSubmission: submission({
          revisionAcknowledgementReason: 'The addendum changed access hours only',
        }),
      }),
      'approval',
    );
    expect(text(approval.element)).toContain(
      'The proposed bid answered an earlier tender revision',
    );
    expect(text(approval.element)).toContain('The addendum changed access hours only');
  });

  it('shows approvers the justifications that go with the version', () => {
    const view = pending({
      currentSubmission: submission({
        limitedCompetition: true,
        competitionCategory: 'Urgency',
        competitionReason: 'Plant room handover is contractual',
        overBudget: true,
        overBudgetReason: 'Scope grew after the estimate',
      }),
    });
    const { element } = render(view, 'approval');
    expect(text(element)).toContain('Limited competition');
    expect(text(element)).toContain('Urgency does not allow re-tendering');
    expect(text(element)).toContain('Plant room handover is contractual');
    expect(text(element)).toContain('Above the package estimate');
    expect(text(element)).toContain('Scope grew after the estimate');
  });

  it('awards a lapsed bid only with the recorded extension', () => {
    const lapsed = controls({
      candidates: [
        controls().candidates[0],
        { ...controls().candidates[1], validityState: 'Lapsed' },
      ],
    });
    const approved = pending({
      status: 'Approved',
      currentSubmission: submission({ outcome: 'Approved' }),
      controls: lapsed,
    });
    const { element, http, page } = render(approved, 'approval');
    button(element, 'Issue the award')!.click();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(dialog)).toContain('validity lapsed');
    (dialog.querySelector('input[name="awardConfirmed"]') as HTMLInputElement).click();
    page.detectChanges();
    button(dialog, 'Issue the award')!.click();
    page.detectChanges();
    expect(text(dialog)).toContain('Record until when the bidder extended the validity');
    http.expectNone('/api/v1/tenders/t1/award');

    const until = dialog.querySelector('#award-extended-until') as HTMLInputElement;
    until.value = '2026-12-31';
    until.dispatchEvent(new Event('input'));
    const channel = dialog.querySelector('#award-extension-channel') as HTMLSelectElement;
    channel.value = channel.options[1].value;
    channel.dispatchEvent(new Event('change'));
    const reference = dialog.querySelector('#award-extension-reference') as HTMLInputElement;
    reference.value = 'LTR-114';
    reference.dispatchEvent(new Event('input'));
    page.detectChanges();
    button(dialog, 'Issue the award')!.click();
    const issued = http.expectOne('/api/v1/tenders/t1/award');
    expect(issued.request.body.validityConfirmation).toEqual({
      extendedUntil: '2026-12-31',
      channel: 'Letter',
      reference: 'LTR-114',
    });
  });

  it('sends no extension when the proposed bid is still valid', () => {
    const approved = pending({
      status: 'Approved',
      currentSubmission: submission({ outcome: 'Approved' }),
      controls: controls(),
    });
    const { element, http, page } = render(approved, 'approval');
    button(element, 'Issue the award')!.click();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.querySelector('#award-extended-until')).toBeNull();
    (dialog.querySelector('input[name="awardConfirmed"]') as HTMLInputElement).click();
    page.detectChanges();
    button(dialog, 'Issue the award')!.click();
    expect(
      http.expectOne('/api/v1/tenders/t1/award').request.body.validityConfirmation,
    ).toBeUndefined();
  });
});

describe('Approval route facts (CF-034, CF-099, CF-136)', () => {
  const route = submission().route;
  const routed = (overrides: Partial<typeof route>) =>
    pending({ currentSubmission: submission({ route: { ...route, ...overrides } }) });

  it('marks a route without independent approval on the approval view, and only that route (CF-034 AC5)', () => {
    const zero = render(routed({ requiredApprovals: 0, steps: [] }), 'approval');
    expect(text(zero.element)).toContain('Approved without independent approval');
    TestBed.resetTestingModule();
    const selfApproval = render(routed({ allowSelfApproval: true }), 'approval');
    expect(text(selfApproval.element)).toContain('Approved without independent approval');
    TestBed.resetTestingModule();
    const independent = render(
      routed({
        requiredApprovals: 1,
        allowSelfApproval: false,
        steps: [{ step: 1, role: 'ApproverDirector', approval: null }],
      }),
      'approval',
    );
    expect(text(independent.element)).not.toContain('Approved without independent approval');
  });

  it('reads the default route from the server flag, never from a rule named "default" (CF-099 AC3)', () => {
    const named = render(routed({ ruleName: 'default', isDefault: false }), 'approval');
    expect(text(named.element)).toContain('Rule default');
    expect(text(named.element)).not.toContain('No approval rule matches');
    TestBed.resetTestingModule();
    const fallback = render(routed({ ruleName: 'Default route', isDefault: true }), 'approval');
    expect(text(fallback.element)).toContain('No approval rule matches');
  });

  it('links the approval view to the rule that routed it, for readers of the approval routes (CF-136 AC6)', () => {
    const { element } = render(routed({}), 'approval', ['Decision.View', 'Award.Approve']);
    const link = element.querySelector<HTMLAnchorElement>('a[href^="/approval-matrix/read"]')!;
    expect(link.getAttribute('href')).toBe('/approval-matrix/read?rule=Up%20to%205M');
    expect(text(link).trim()).toBe('See this rule in the approval routes');
    TestBed.resetTestingModule();
    const fallback = render(routed({ ruleName: 'Default route', isDefault: true }), 'approval', [
      'Decision.View',
      'Award.Approve',
    ]);
    expect(
      fallback.element.querySelector('a[href^="/approval-matrix/read"]')!.getAttribute('href'),
    ).toBe('/approval-matrix/read?rule=default');
    // A reader who may not open the approval routes is not sent to a refusal.
    TestBed.resetTestingModule();
    const reader = render(routed({}), 'approval', ['Decision.View']);
    expect(reader.element.querySelector('a[href^="/approval-matrix/read"]')).toBeNull();
  });

  it('links the prepare preview to the rule that will route the decision (CF-136 AC6)', async () => {
    const view = decision({ routePreview: route });
    const { element, page } = render(view, 'decision', ['Decision.View', 'Decision.Submit']);
    await settle();
    page.detectChanges();
    const link = element.querySelector<HTMLAnchorElement>(
      '.dc-route a[href^="/approval-matrix/read"]',
    )!;
    expect(link.getAttribute('href')).toBe('/approval-matrix/read?rule=Up%20to%205M');
  });
});

describe('The recommendation tab shows competition and validity (CF-038 AC1, CF-039 AC1/AC2)', () => {
  it('shows the invited, opened and compliant counts and marks first place "not market-tested" when competition is limited', async () => {
    const limited = decision({
      recommendation: { ...recommendation(), limitedCompetition: true, minimumCompliantBids: 3 },
      controls: controls({ eligible: 2, minimumCompliantBids: 3, limitedCompetition: true }),
    });
    const { element, page } = render(limited, 'recommendation');
    await settle();
    page.detectChanges();
    const panel = element.querySelector('[role="tabpanel"]') as HTMLElement;
    const controlsPanel = panel.querySelector('app-decision-controls') as HTMLElement;
    const facts = Object.fromEntries(
      [...controlsPanel.querySelectorAll('dl.dc-facts > div')].map((pair) => [
        text(pair.querySelector('dt') as HTMLElement).trim(),
        text(pair.querySelector('dd') as HTMLElement).trim(),
      ]),
    );
    expect(facts['Invited']).toBe('4');
    expect(facts['Bids opened']).toBe('3');
    expect(facts['Compliant bids']).toBe('2 (your company requires 3)');
    expect(text(controlsPanel)).toContain('Limited competition');
    const chips = [...panel.querySelectorAll('[data-testid="not-market-tested"]')];
    expect(chips).toHaveLength(1);
    expect(text(chips[0] as HTMLElement).trim()).toBe('Not market-tested');
    expect(text(chips[0].closest('li') as HTMLElement)).toContain('Recommendation rank 1');
    expect(chips[0].getAttribute('title')).toContain(
      'fewer compliant bids than your company requires',
    );
  });

  it('shows no chip when competition meets the company minimum', async () => {
    const { element, page } = render(decision({ controls: controls() }), 'recommendation');
    await settle();
    page.detectChanges();
    expect(element.querySelector('[data-testid="not-market-tested"]')).toBeNull();
    expect(text(element)).not.toContain('Limited competition');
  });

  it('shows a lapsed bid as lapsed, with its valid-until date and basis', async () => {
    const base = controls();
    const lapsed = decision({
      controls: {
        ...base,
        candidates: [
          { ...base.candidates[0], validityState: 'Lapsed', validUntilUtc: '2026-10-05T09:00:00Z' },
          base.candidates[1],
        ],
      },
    });
    const { element, page } = render(lapsed, 'recommendation');
    await settle();
    page.detectChanges();
    const row = [...element.querySelectorAll('app-decision-controls tbody tr')].find((tr) =>
      text(tr as HTMLElement).includes('ACME-01'),
    ) as HTMLElement;
    expect(text(row)).toContain('Lapsed');
    expect(text(row)).toContain('until Oct 5, 2026');
    expect(text(element.querySelector('app-decision-controls') as HTMLElement)).toContain(
      'Validity runs',
    );
  });
});

describe('The recommendation names its exact policy version (CF-133 AC5)', () => {
  it('links the recommendation to the policy version it used', async () => {
    const { element, page } = render(decision(), 'recommendation');
    await settle();
    page.detectChanges();
    const link = element.querySelector<HTMLAnchorElement>('[data-testid="policy-version-link"]')!;
    expect(link.getAttribute('href')).toBe('/recommendation-policies?policy=pol1&version=1');
    expect(text(link).trim()).toBe('Balanced award');
  });
});

describe('A link to a tab the decision does not show (CF-104 AC1)', () => {
  it('rewrites the address to the tab shown, replacing the history entry', () => {
    const http = configure('award');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const page = TestBed.createComponent(DecisionPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/decision').flush(decision());
    page.detectChanges();
    expect(page.componentInstance.tab()).toBe('overview');
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { tab: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('leaves the address alone when the tab is shown', () => {
    const http = configure('recommendation');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const page = TestBed.createComponent(DecisionPage);
    page.detectChanges();
    http.expectOne('/api/v1/tenders/t1/decision').flush(decision());
    page.detectChanges();
    expect(page.componentInstance.tab()).toBe('recommendation');
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('The award baseline shows its decision governance context (red-team B4: G016, G048, G050)', () => {
  const awarded = (baseline: Partial<ReturnType<typeof award>['baseline']>, timeZoneId?: string) =>
    pending({
      status: 'Awarded',
      currentSubmission: submission({ outcome: 'Awarded' }),
      award: award({ baseline: { ...award().baseline, ...baseline } }),
      timeZoneId: timeZoneId ?? null,
    });

  it('marks the route, the limited competition, the over-budget reason, validity in the tender zone and the extension', () => {
    const { element } = render(
      awarded(
        {
          routeWithoutIndependentApproval: true,
          limitedCompetition: true,
          competitionCategory: 'Urgency',
          competitionReason: 'The client moved the handover date.',
          overBudget: true,
          overBudgetReason: 'Steel prices rose after the estimate.',
          validityBasis: 'SubmissionDeadline',
          validUntilUtc: '2026-12-30T09:00:00Z',
          validityExtendedUntil: '2027-01-31',
          validityExtensionChannel: 'Letter',
          validityExtensionReference: 'LTR-2026-114',
        },
        'Asia/Qatar',
      ),
      'award',
    );
    const baseline = element.querySelector('app-award-baseline') as HTMLElement;
    const shown = text(baseline);
    const chip = [...baseline.querySelectorAll('.prj-chip')].find((node) =>
      text(node).includes('Approved without independent approval'),
    );
    expect(chip).toBeDefined();
    const limited = baseline.querySelector('[data-testid="baseline-limited"]') as HTMLElement;
    expect(text(limited)).toContain('Limited competition');
    expect(text(limited)).toContain('Urgency does not allow re-tendering');
    expect(text(limited)).toContain('The client moved the handover date.');
    const over = baseline.querySelector('[data-testid="baseline-over-budget"]') as HTMLElement;
    expect(text(over)).toContain('Above the package estimate');
    expect(text(over)).toContain('Steel prices rose after the estimate.');
    const validity = text(baseline.querySelector('[data-testid="baseline-validity"]')!);
    // 09:00 UTC is 12:00 in Doha: the date is read in the tender's zone, with the zone and its offset.
    expect(validity).toContain('90 days, until Dec 30, 2026, 12:00 (Asia/Qatar, UTC+03:00)');
    expect(validity).toContain('Validity runs from the submission deadline');
    expect(shown).toContain(
      'The bidder extended validity until Jan 31, 2027 (Signed letter LTR-2026-114).',
    );
  });

  it('shows nothing extra for an older award whose context fields are absent', () => {
    const { element } = render(awarded({}), 'award');
    const baseline = element.querySelector('app-award-baseline') as HTMLElement;
    const shown = text(baseline);
    expect(shown).not.toContain('Approved without independent approval');
    expect(shown).not.toContain('Limited competition');
    expect(shown).not.toContain('Above the package estimate');
    expect(shown).not.toContain('extended validity');
    expect(shown).not.toContain('low-value fast path');
    expect(baseline.querySelector('[data-testid="baseline-validity"]')).toBeNull();
  });

  it('falls back to an explicit UTC date when the tender zone is unknown', () => {
    const { element } = render(awarded({ validUntilUtc: '2026-12-30T09:00:00Z' }), 'award');
    const validity = text(element.querySelector('[data-testid="baseline-validity"]')!);
    expect(validity).toContain('90 days, until Dec 30, 2026');
    expect(validity).toContain('UTC');
    expect(validity).not.toContain('Asia/');
  });
});

describe('The shortlist fast-path basis (red-team G073, CF-057 AC5)', () => {
  const fastPath = [
    {
      approvalId: 'sa1',
      round: 1,
      fastPath: true,
      approvedByName: 'Omar Officer',
      approvedAtUtc: '2026-09-20T08:00:00Z',
    },
  ];
  const fourEyes = [{ ...fastPath[0], fastPath: false }];

  it('shows the chip and who approved the shortlist on the decision and approval tabs', () => {
    for (const tab of ['decision', 'approval']) {
      const view =
        tab === 'decision'
          ? decision({ shortlistBasis: fastPath })
          : pending({ shortlistBasis: fastPath });
      const { element } = render(view, tab);
      const note = element.querySelector('[data-testid="shortlist-basis"]') as HTMLElement;
      expect(note, tab).not.toBeNull();
      expect(text(note)).toContain(
        'Shortlist approved through the low-value fast path (approved vendors, one approver)',
      );
      expect(text(note)).toContain('Shortlist round 1 approved by Omar Officer, Sep 20, 2026');
      TestBed.resetTestingModule();
    }
  });

  it('shows the chip on the award baseline from the baseline basis', () => {
    const { element } = render(
      pending({
        status: 'Awarded',
        currentSubmission: submission({ outcome: 'Awarded' }),
        award: award({ baseline: { ...award().baseline, shortlistBasis: fastPath } }),
      }),
      'award',
    );
    const baseline = element.querySelector('app-award-baseline') as HTMLElement;
    expect(baseline.querySelector('[data-testid="shortlist-basis"]')).not.toBeNull();
  });

  it('shows nothing for a four-eyes shortlist or when no basis is known', () => {
    for (const basis of [fourEyes, null]) {
      const { element } = render(pending({ shortlistBasis: basis }), 'approval');
      expect(element.querySelector('[data-testid="shortlist-basis"]')).toBeNull();
      expect(text(element)).not.toContain('low-value fast path');
      TestBed.resetTestingModule();
    }
  });
});

describe('The decision controls show the estimate at publication and validity in the tender zone (red-team B7, G050)', () => {
  const controlsPanel = (element: HTMLElement) =>
    element.querySelector('app-decision-controls') as HTMLElement;

  it('shows the value at publication beside the current estimate', () => {
    const { element } = render(
      decision({
        controls: controls({
          estimateAtPublication: '1500000.00',
          estimateChangedAfterPublication: true,
          estimateComparable: true,
        }),
      }),
      'decision',
    );
    const panel = controlsPanel(element);
    expect(text(panel)).toContain('1,620,000.00 QAR');
    expect(text(panel)).toContain('At publication: 1,500,000.00 QAR');
    expect(text(panel)).toContain(
      'The package estimate was changed after this tender was published',
    );
    expect(text(panel)).toContain('Leveled total against the estimate');
  });

  it('says the estimate is not comparable when it is in another currency, with no variance column', () => {
    const { element } = render(
      decision({
        controls: controls({
          estimate: '450000.00',
          estimateCurrency: 'USD',
          proposedVariancePercent: null,
          estimateComparable: false,
          estimateNotComparableReason: 'currency',
          candidates: controls().candidates.map((row) => ({
            ...row,
            estimateVariancePercent: null,
          })),
        }),
      }),
      'decision',
    );
    const panel = controlsPanel(element);
    expect(text(panel)).toContain('450,000.00 USD');
    expect(text(panel)).toContain(
      'Not comparable: the estimate is in USD, the bids in QAR. Nothing is converted.',
    );
    expect(text(panel)).not.toContain('Leveled total against the estimate');
  });

  it('renders nothing estimate-related for a reader who may not see the estimate', () => {
    const { element } = render(
      decision({
        controls: controls({
          estimate: null,
          estimateCurrency: null,
          proposedVariancePercent: null,
          estimateAtPublication: null,
          estimateComparable: null,
        }),
      }),
      'decision',
    );
    const panel = text(controlsPanel(element));
    for (const absent of [
      'Package estimate',
      'At publication',
      'Not comparable',
      'against the estimate',
    ])
      expect(panel).not.toContain(absent);
  });

  it('reads valid-until in the tender time zone on the recommendation tab', async () => {
    const { element, page } = render(
      decision({ controls: controls(), timeZoneId: 'Asia/Riyadh' }),
      'recommendation',
    );
    await settle();
    page.detectChanges();
    expect(text(controlsPanel(element))).toContain(
      '90 days, until Dec 30, 2026, 12:00 (Asia/Riyadh, UTC+03:00)',
    );
  });
});

describe('Preparing the next decision after a released award (red-team G076, CF-046 AC3, ADR-172)', () => {
  // Acme (rank 1) was awarded and declined; Beta (rank 2) and Delta (rank 3) remain eligible.
  const released = (overrides: Partial<DecisionWorkspace> = {}) =>
    decision({
      status: 'Draft',
      decisionVersion: 'dv1',
      recommendation: recommendation({
        candidates: [
          ...recommendation().candidates,
          candidate({
            openingBidId: 'b4',
            subcontractorCode: 'DELT-01',
            subcontractorName: 'Delta Builders',
            leveledTotal: '2100000.00',
            submittedTotal: '2100000.00',
            rank: 3,
            total: 70.5,
            flags: [],
          }),
        ],
      }),
      award: award({
        subcontractorCode: 'ACME-01',
        subcontractorName: 'Acme Mechanical',
        sequence: 1,
        state: 'Declined',
      }),
      promotionSuggestion: { openingBidId: 'b2', source: 'next_ranked' },
      ...overrides,
    });
  const draftFor = (proposedOpeningBidId: string, awardValue: string) => ({
    recommendationId: 'rec1',
    proposedOpeningBidId,
    isOverride: false,
    overrideReason: null,
    awardValue,
    valueReason: null,
    rationale: null,
    dispositions: [],
    suggestedAwardValue: awardValue,
    updatedAtUtc: '2026-10-12T11:00:00Z',
    preparedByName: 'Maha Manager',
    competitionCategory: null,
    competitionReason: null,
    overBudgetReason: null,
  });
  const options = (element: HTMLElement) => [
    ...(element.querySelector('#decision-proposed') as HTMLSelectElement).options,
  ];

  it('pre-selects the suggested bid, names why, and disables the previous awardee with a note', async () => {
    const { element, page } = render(released(), 'decision');
    await settle();
    page.detectChanges();
    expect((element.querySelector('#decision-proposed') as HTMLSelectElement).value).toBe('b2');
    expect((element.querySelector('#decision-value') as HTMLInputElement).value).toBe(
      '1,950,000.00',
    );
    expect(text(element)).toContain(
      'Suggested after the earlier award ended: BETA-01 — Beta Contracting, the next-ranked eligible bid.',
    );
    const acme = options(element).find((option) => option.value === 'b1')!;
    expect(acme.disabled).toBe(true);
    expect(text(acme)).toContain('(earlier award declined or withdrawn)');
    expect(text(element)).toContain(
      'Firms whose award on this tender was declined or withdrawn cannot be proposed again.',
    );
    // The next-ranked firm is the first rank now: no override.
    expect(element.querySelector('#decision-override')).toBeNull();
    expect(text(element)).not.toContain('recorded as an override');
  });

  it('names a first reserve kept by the released award as the source of the suggestion', async () => {
    const { element, page } = render(
      released({
        promotionSuggestion: { openingBidId: 'b2', source: 'reserve_rank_1' },
        award: award({
          subcontractorCode: 'ACME-01',
          subcontractorName: 'Acme Mechanical',
          sequence: 1,
          state: 'Withdrawn',
        }),
      }),
      'decision',
    );
    await settle();
    page.detectChanges();
    expect((element.querySelector('#decision-proposed') as HTMLSelectElement).value).toBe('b2');
    expect(text(element)).toContain('the first reserve that award kept.');
  });

  it('pre-selects the next-ranked firm without a suggestion, leaving out earlier awards too', async () => {
    const { element, page } = render(
      released({
        promotionSuggestion: null,
        award: award({ sequence: 2, state: 'AwaitingResponse' }),
        previousAwards: [
          {
            id: 'aw0',
            sequence: 1,
            subcontractorCode: 'ACME-01',
            subcontractorName: 'Acme Mechanical',
            awardValue: '1800000.00',
            currency: 'QAR',
            awardedAtUtc: '2026-10-08T09:00:00Z',
            state: 'Declined',
            reason: null,
            baselineSha256: 'e'.repeat(64),
          },
        ],
      }),
      'decision',
    );
    await settle();
    page.detectChanges();
    expect((element.querySelector('#decision-proposed') as HTMLSelectElement).value).toBe('b2');
    expect(options(element).find((option) => option.value === 'b1')!.disabled).toBe(true);
  });

  it('lets a reader without the override right submit the next-ranked firm without a reason', async () => {
    const { element, http, page } = render(
      released({
        access: { ...FULL_DECISION_ACCESS, override: false },
        draft: draftFor('b2', '1950000.00'),
      }),
      'decision',
    );
    await settle();
    page.detectChanges();
    // Only the first rank without previous awardees may be chosen; the previous awardee is listed, disabled.
    expect(options(element).map((option) => [option.value, option.disabled])).toEqual([
      ['b1', true],
      ['b2', false],
    ]);
    expect(element.querySelector('#decision-override')).toBeNull();
    button(element, 'Submit for approval')!.click();
    page.detectChanges();
    expect(text(element)).not.toContain('Explain why a firm not ranked first is proposed');
    expect(text(element)).not.toContain('Only people with the override right');
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
    verifyAll(http);
  });

  it('still asks for an override reason for a lower firm than the next-ranked one', async () => {
    const { element, http, page } = render(
      released({ draft: draftFor('b4', '2100000.00') }),
      'decision',
    );
    await settle();
    page.detectChanges();
    expect((element.querySelector('#decision-proposed') as HTMLSelectElement).value).toBe('b4');
    expect(text(element)).toContain('recorded as an override');
    expect(element.querySelector('#decision-override')).not.toBeNull();
    button(element, 'Submit for approval')!.click();
    page.detectChanges();
    expect(text(element)).toContain('Explain why a firm not ranked first is proposed');
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    verifyAll(http);
  });
});
