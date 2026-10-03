import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { KNOWN_PROBLEM_CODES, knownProductProblem } from '../../core/localization/product-problem';
import { CloseoutPage, missingTarget } from './closeout-page';
import { CloseoutsList } from './closeouts-list';
import { HistoryEvidence } from './history-evidence';
import { CloseoutWorkspace, PERFORMANCE_FEATURES } from './performance.api';
import {
  PM_ACCESS,
  QS_ACCESS,
  closedCloseout,
  history,
  mechanical,
  pendingCloseout,
  recordedCloseout,
} from './performance.fixtures';
import { missingStep, signedAmount, signedPercent } from './performance-labels';
import { SubcontractorPerformanceView } from './subcontractor-performance';

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ');
const button = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll('button')].find((candidate) => text(candidate).includes(label)) as
    HTMLButtonElement | undefined;
const settle = () => new Promise((resolve) => setTimeout(resolve));

function configure(step: string | null = null, permissions: string[] = ['Performance.View']) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ awardId: 'a1' }) },
          queryParamMap: of(convertToParamMap(step ? { step } : {})),
        },
      },
    ],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({ userId: 'u1', tenantId: 't', roles: ['ProjectManager'], permissions });
  return TestBed.inject(HttpTestingController);
}

/** A closed closeout with every section recorded, read by someone who may edit neither section. */
function fullyRecordedClosed(): CloseoutWorkspace {
  const closed = closedCloseout({ ...PM_ACCESS, editExecution: false, editCommercial: false });
  return {
    ...closed,
    commercial: { ...closed.commercial, variationCause: 'ClientChange' },
    execution: { ...closed.execution, outcomeType: 'Completed', qualityComment: null },
  };
}

async function render(view: CloseoutWorkspace, step: string | null = null) {
  const http = configure(step);
  const page = TestBed.createComponent(CloseoutPage);
  page.detectChanges();
  http.expectOne('/api/v1/performance/closeouts/a1').flush(view);
  page.detectChanges();
  await page.whenStable();
  page.detectChanges();
  return { http, page, element: page.nativeElement as HTMLElement };
}

describe('Part 11 problem codes and formats', () => {
  it('explains every closeout refusal and never shows a percentage without its sign', () => {
    for (const code of [
      'performance.invalid',
      'performance.reason_required',
      'performance.incomplete',
      'performance.already_closed',
      'performance.not_closed',
      'performance.closed_read_only',
      'performance.section_stale',
      'performance.confirmation_required',
      'performance.not_assigned_manager',
    ])
      expect(KNOWN_PROBLEM_CODES).toContain(code);
    expect(
      knownProductProblem({
        code: 'performance.invalid',
        parameters: { field: 'unresolvedClaimCount' },
      }),
    ).toContain('never more than the claims');
    expect(knownProductProblem({ code: 'performance.section_stale' })).toContain('Reload');
    expect([
      signedPercent('11.00'),
      signedPercent('-10.00'),
      signedPercent('0.00'),
      signedPercent(null),
    ]).toEqual(['+11.00 %', '−10.00 %', '0.00 %', '—']);
    expect([signedAmount('55000.00', 'en'), signedAmount('-50000.00', 'en')]).toEqual([
      '+55,000.00',
      '−50,000.00',
    ]);
  });
});

describe('Closeout workspace', () => {
  it('starts pending from the frozen baseline and names everything still missing', async () => {
    const { element } = await render(pendingCloseout(), 'review');
    expect(text(element)).toContain('Closeout pending');
    expect(text(element)).toContain('Recorded 0 / 9 required items');
    for (const missing of [
      'Actual final cost',
      'Quality rating',
      'Variations (enter 0 if none)',
      'Would-work-again decision',
    ])
      expect(text(element)).toContain(missing);
    // Finalizing is offered to the project manager but impossible while anything is missing.
    expect(button(element, 'Close out this award')?.disabled).toBe(true);
  });

  it('shows awarded, actual and variance side by side, in words and with a sign — never by colour alone', async () => {
    const { element } = await render(recordedCloseout());
    const shown = text(element);
    expect(shown).toContain('500,000.00 QAR');
    expect(shown).toContain('555,000.00 QAR');
    expect(shown).toContain('+11.00 %');
    expect(shown).toContain('(+55,000.00 QAR)');
    expect(shown).toContain('Over the award value');
    expect(shown).toContain('+20.00 %');
    expect(shown).toContain('Longer than awarded');
    expect(shown).toContain('90 days');
    expect(shown).toContain('108 days');
    // No invented mobilization promise: the baseline has none, so there is nothing to compare with.
    expect(shown).toContain('Not captured at award — nothing to compare with');
    expect(shown).toContain('Mobilized as planned');
    expect(shown).toContain('92 / 100');
    expect(shown).toContain('5 — Excellent');
  });

  it('lets the project manager save execution only, with the section version it loaded', async () => {
    const { http, page, element } = await render(recordedCloseout(PM_ACCESS), 'quality');
    // The radio accessor consumes [value] (it is not written to the DOM), so the third choice is rating 3.
    const rating = element.querySelectorAll<HTMLInputElement>('input[name="qualityRating"]')[2];
    rating.click();
    page.detectChanges();
    button(element, 'Save execution outcome')!.click();
    const request = http.expectOne('/api/v1/performance/closeouts/a1/execution');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(
      expect.objectContaining({
        sectionVersion: 'e1',
        qualityRating: 3,
        hseRating: 4,
        wouldWorkAgain: 'Yes',
      }),
    );
    request.flush(recordedCloseout(PM_ACCESS));
    page.detectChanges();
    expect(text(element)).toContain('Execution outcome saved.');
    // The commercial step is readable but belongs to Commercial/QS.
    TestBed.resetTestingModule();
    const { element: commercial } = await render(recordedCloseout(PM_ACCESS), 'commercial');
    expect(text(commercial)).toContain('Recorded by the commercial team');
    // CF-101: read as values, not as a disabled form.
    expect(
      commercial.querySelectorAll('.pf-panel input, .pf-panel select, .pf-panel textarea'),
    ).toHaveLength(0);
    expect(commercial.querySelector('dl.pf-readonly')).not.toBeNull();
    expect(button(commercial, 'Save commercial outcome')).toBeUndefined();
  });

  it('refuses a decimal comma on the client and sends money as exact canonical strings', async () => {
    const { http, page, element } = await render(pendingCloseout(QS_ACCESS), 'commercial');
    const cost = element.querySelector<HTMLInputElement>('#money-actualFinalCost')!;
    cost.value = '555000,5';
    cost.dispatchEvent(new Event('input'));
    page.detectChanges();
    button(element, 'Save commercial outcome')!.click();
    page.detectChanges();
    http.expectNone('/api/v1/performance/closeouts/a1/commercial');
    expect(text(element)).toContain('Use a point for decimals');
    cost.value = '555,000.50';
    cost.dispatchEvent(new Event('input'));
    page.detectChanges();
    button(element, 'Save commercial outcome')!.click();
    const request = http.expectOne('/api/v1/performance/closeouts/a1/commercial');
    expect(request.request.body).toEqual(
      expect.objectContaining({
        sectionVersion: null,
        actualFinalCost: '555000.50',
        variationCount: null,
      }),
    );
    // A stale section is explained and offers a reload.
    request.flush(
      { code: 'performance.section_stale', parameters: { section: 'commercial' } },
      { status: 409, statusText: 'Conflict' },
    );
    page.detectChanges();
    expect(text(element)).toContain('Someone saved this part of the closeout');
  });

  it('finalizes only after an explicit confirmation and retries with the same request key', async () => {
    const { http, page, element } = await render(recordedCloseout(PM_ACCESS), 'review');
    button(element, 'Close out this award')!.click();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]')!;
    expect(text(dialog)).toContain('becomes version 1');
    button(dialog as HTMLElement, 'Close out')!.click();
    const first = http.expectOne('/api/v1/performance/closeouts/a1/finalize');
    expect(first.request.body).toEqual(expect.objectContaining({ version: 'v1', confirmed: true }));
    const key = first.request.body.requestKey;
    first.error(new ProgressEvent('error'));
    page.detectChanges();
    button(element, 'Close out this award')!.click();
    page.detectChanges();
    button(element.querySelector('[role="dialog"]') as HTMLElement, 'Close out')!.click();
    const retry = http.expectOne('/api/v1/performance/closeouts/a1/finalize');
    expect(retry.request.body.requestKey).toBe(key);
    retry.flush(closedCloseout(PM_ACCESS));
    page.detectChanges();
    await settle();
    expect(text(element)).toContain('Version 1 is now part of the performance history');
    expect(text(element)).toContain('Closed on');
    expect(button(element, 'Close out this award')).toBeUndefined();
  });

  it('shows the assigned Project Manager and asks anyone else to confirm before finalizing', async () => {
    // CF-036: finalizing a project another Project Manager is assigned to needs an explicit, audited confirmation.
    const { http, page, element } = await render(
      { ...recordedCloseout(PM_ACCESS), assignedToYou: false },
      'review',
    );
    expect(text(element.querySelector('[data-testid="assigned-pm"]')!)).toContain(
      'Assigned Project Manager: Pat Manager',
    );
    button(element, 'Close out this award')!.click();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(dialog)).toContain('This project is assigned to Pat Manager');
    button(dialog, 'Close out')!.click();
    page.detectChanges();
    http.expectNone('/api/v1/performance/closeouts/a1/finalize');
    expect(text(element)).toContain('Confirm that you are finalizing on behalf of');
    const confirm = dialog.querySelector<HTMLInputElement>('#not-assigned-confirmed')!;
    confirm.checked = true;
    confirm.dispatchEvent(new Event('change'));
    page.detectChanges();
    button(dialog, 'Close out')!.click();
    const request = http.expectOne('/api/v1/performance/closeouts/a1/finalize');
    expect(request.request.body).toEqual(
      expect.objectContaining({ confirmed: true, notAssignedConfirmed: true }),
    );
    request.flush(closedCloseout(PM_ACCESS));
  });

  it('never asks the assigned Project Manager to confirm and says when no one is assigned', async () => {
    const { http, page, element } = await render(recordedCloseout(PM_ACCESS), 'review');
    expect(text(element)).toContain('Pat Manager (you)');
    button(element, 'Close out this award')!.click();
    page.detectChanges();
    expect(element.querySelector('#not-assigned-confirmed')).toBeNull();
    button(element.querySelector('[role="dialog"]') as HTMLElement, 'Close out')!.click();
    expect(
      http.expectOne('/api/v1/performance/closeouts/a1/finalize').request.body.notAssignedConfirmed,
    ).toBe(false);
    TestBed.resetTestingModule();
    const { element: none } = await render(
      { ...recordedCloseout(PM_ACCESS), assignedProjectManagerName: null, assignedToYou: false },
      'review',
    );
    expect(text(none)).toContain('No Project Manager is assigned to this project.');
  });

  it('reopens a closed closeout only with a reason', async () => {
    const { http, page, element } = await render(
      closedCloseout({ ...PM_ACCESS, finalize: false, reopen: true }),
      'review',
    );
    button(element, 'Reopen for correction')!.click();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    button(dialog, 'Reopen')!.click();
    page.detectChanges();
    http.expectNone('/api/v1/performance/closeouts/a1/reopen');
    expect(text(element)).toContain('Explain the correction');
    const reason = dialog.querySelector<HTMLTextAreaElement>('#reopen-reason')!;
    reason.value = 'Final account revised after audit';
    reason.dispatchEvent(new Event('input'));
    page.detectChanges();
    button(dialog, 'Reopen')!.click();
    const request = http.expectOne('/api/v1/performance/closeouts/a1/reopen');
    expect(request.request.body).toEqual(
      expect.objectContaining({
        version: 'v2',
        reason: 'Final account revised after audit',
        confirmed: true,
      }),
    );
  });

  it('can focus every missing item the server can name, on its own step', async () => {
    const keys = [
      'actual_final_cost',
      'cost_explanation',
      'actual_start_date',
      'actual_completion_date',
      'schedule_explanation',
      'quality_rating',
      'quality_comment',
      'hse_rating',
      'hse_comment',
      'variations',
      'claims',
      'unresolved_claims',
      'disputes',
      'unresolved_disputes',
      'would_work_again',
      'would_work_again_rationale',
    ];
    const everything = { ...PM_ACCESS, editCommercial: true };
    for (const key of keys) {
      TestBed.resetTestingModule();
      const { element, page } = await render(recordedCloseout(everything), 'review');
      document.body.appendChild(element);
      page.componentInstance.goToMissing(key);
      await settle();
      page.detectChanges();
      await settle();
      const target = element.querySelector<HTMLElement>(`#${missingTarget(key)}`);
      expect(target, key).not.toBeNull();
      expect(document.activeElement, key).toBe(target);
      element.remove();
    }
    // Someone who cannot edit that section lands on the step itself, never on the page body.
    TestBed.resetTestingModule();
    const { element, page } = await render(recordedCloseout(PM_ACCESS), 'review');
    document.body.appendChild(element);
    page.componentInstance.goToMissing('actual_final_cost');
    await settle();
    page.detectChanges();
    await settle();
    expect(document.activeElement?.id).toBe('closeout-panel-commercial');
    element.remove();
  });

  it('takes a money error on the other commercial step to that step, and a reload clears refusals', async () => {
    const { http, page, element } = await render(recordedCloseout(QS_ACCESS), 'commercial');
    page.componentInstance.commercial.claimedValue = '12,5';
    button(element, 'Save commercial outcome')!.click();
    await page.whenStable();
    page.detectChanges();
    http.expectNone('/api/v1/performance/closeouts/a1/commercial');
    expect(page.componentInstance.step()).toBe('issues');
    expect(text(element)).toContain('Use a point for decimals');
    // A fractional count is refused on the client too, with the field's own message.
    page.componentInstance.commercial.claimedValue = '';
    page.componentInstance.commercial.claimCount = 1.5;
    button(element, 'Save commercial outcome')!.click();
    page.detectChanges();
    http.expectNone('/api/v1/performance/closeouts/a1/commercial');
    expect(text(element)).toContain('Enter a whole number from 0 to 9999');
    page.componentInstance.commercial.claimCount = 1;
    button(element, 'Save commercial outcome')!.click();
    http
      .expectOne('/api/v1/performance/closeouts/a1/commercial')
      .flush({ code: 'performance.section_stale' }, { status: 409, statusText: 'Conflict' });
    page.detectChanges();
    expect(element.querySelector('#section-error')).not.toBeNull();
    page.componentInstance.load();
    http.expectOne('/api/v1/performance/closeouts/a1').flush(recordedCloseout(QS_ACCESS));
    page.detectChanges();
    expect(element.querySelector('#section-error')).toBeNull();
  });

  it("saves a kept draft against the version it was loaded from, never a colleague's newer one", async () => {
    const both = { ...PM_ACCESS, editCommercial: true };
    const { http, page, element } = await render(recordedCloseout(both), 'schedule');
    page.componentInstance.execution.scheduleExplanation = 'My unsaved edit';
    // A commercial save returns a view in which a colleague has meanwhile saved the execution section.
    page.componentInstance.saveCommercial();
    const colleague = recordedCloseout(both);
    http.expectOne('/api/v1/performance/closeouts/a1/commercial').flush({
      ...colleague,
      execution: { ...colleague.execution, sectionVersion: 'e2' },
    });
    page.detectChanges();
    expect(page.componentInstance.execution.scheduleExplanation).toBe('My unsaved edit');
    button(element, 'Save execution outcome')!.click();
    const request = http.expectOne('/api/v1/performance/closeouts/a1/execution');
    // The server then refuses it as stale instead of silently overwriting the colleague's save.
    expect(request.request.body.sectionVersion).toBe('e1');
  });

  it('records how the subcontract ended and asks to declare works before the award', async () => {
    // CF-048 / CF-082 (ADR-124): the outcome type with its extent; dates before the award (1 March) show the declaration.
    const { http, page, element } = await render(recordedCloseout(PM_ACCESS), 'schedule');
    const settle = async () => {
      page.detectChanges();
      await page.whenStable();
      page.detectChanges();
    };
    const set = async (selector: string, value: string, event = 'input') => {
      const field = element.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
      field.value = value;
      field.dispatchEvent(new Event(event));
      await settle();
    };
    await set('#field-outcome_type', 'TerminatedForDefault', 'change');
    await set('#field-actual_start_date', '2026-02-15');
    expect(element.querySelector('#field-percent_complete')).not.toBeNull();
    expect(text(element)).toContain('Effective end date');
    expect(text(element)).toContain('cost and time are never counted as favourable');
    expect(text(element)).toContain('These dates are before the award');
    await set('#field-percent_complete', '40');
    const declare = element.querySelector<HTMLInputElement>('#field-early_works_declaration')!;
    declare.checked = true;
    declare.dispatchEvent(new Event('change'));
    await settle();
    await set('#early-works-note', 'Mobilized under the letter of intent LOI-4');
    button(element, 'Save execution outcome')!.click();
    const first = http.expectOne('/api/v1/performance/closeouts/a1/execution');
    expect(first.request.body).toEqual(
      expect.objectContaining({
        outcomeType: 'TerminatedForDefault',
        percentComplete: 40,
        earlyWorksDeclared: true,
        earlyWorksNote: 'Mobilized under the letter of intent LOI-4',
      }),
    );
    first.flush(recordedCloseout(PM_ACCESS));
    await settle();
    // A completed subcontract never sends a percentage.
    await set('#field-outcome_type', 'Completed', 'change');
    button(element, 'Save execution outcome')!.click();
    expect(
      http.expectOne('/api/v1/performance/closeouts/a1/execution').request.body.percentComplete,
    ).toBeNull();
  });

  it('asks for an explicit confirmation of implausible timing before finalizing', async () => {
    // CF-082: finalized within 7 days of the award — named in the dialog, confirmed, then sent.
    const { http, page, element } = await render(
      { ...recordedCloseout(PM_ACCESS), timingWarnings: ['finalized_soon'] },
      'review',
    );
    button(element, 'Close out this award')!.click();
    page.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(dialog)).toContain('Finalized less than 7 days after the award');
    button(dialog, 'Close out')!.click();
    page.detectChanges();
    http.expectNone('/api/v1/performance/closeouts/a1/finalize');
    expect(text(element)).toContain('Confirm the timing before finalizing.');
    const confirm = dialog.querySelector<HTMLInputElement>('#timing-confirmed')!;
    confirm.checked = true;
    confirm.dispatchEvent(new Event('change'));
    page.detectChanges();
    button(dialog, 'Close out')!.click();
    expect(
      http.expectOne('/api/v1/performance/closeouts/a1/finalize').request.body.timingConfirmed,
    ).toBe(true);
  });

  it.each([
    [
      'schedule',
      ['Apr 1, 2026', 'Jul 17, 2026', 'Completed', 'Mobilized as planned', 'Late client approvals'],
    ],
    ['commercial', ['555,000.00 QAR', 'Seven approved variations']],
    ['quality', ['5 — Excellent', '4 — Good']],
    ['issues', ['48,000.00 QAR', 'Client change', 'Variations', 'Claims', 'Disputes']],
    ['feedback', ['Yes — would work with them again']],
  ])(
    'renders a closed closeout as values, with no inputs in any section (CF-101 AC1): %s',
    async (step, expected) => {
      const { element } = await render(fullyRecordedClosed(), step);
      expect(
        element.querySelectorAll('.pf-panel input, .pf-panel select, .pf-panel textarea'),
      ).toHaveLength(0);
      expect(element.querySelector('.pf-panel fieldset')).toBeNull();
      const values = element.querySelector('dl.pf-readonly')!;
      expect(values).not.toBeNull();
      const shown = text(element.querySelector('.pf-panel')!);
      for (const value of expected) expect(shown, `${step}: ${value}`).toContain(value);
      // An empty note reads "Not recorded", never a blank or a dash.
      expect(shown).toContain('Not recorded');
      expect(button(element, 'Save')).toBeUndefined();
    },
  );

  it('labels each value with the form field it was recorded in (CF-101 AC1)', async () => {
    const { element } = await render(fullyRecordedClosed(), 'schedule');
    const terms = [...element.querySelectorAll('dl.pf-readonly dt')].map((dt) => text(dt).trim());
    expect(terms).toEqual(
      expect.arrayContaining([
        'How did the subcontract end?',
        'Actual start date',
        'Actual completion',
        'Why did the work take longer than awarded? (required when it did)',
        'Mobilization',
        'Mobilization note (optional)',
      ]),
    );
    const note = [...element.querySelectorAll('dl.pf-readonly > div')].find((row) =>
      text(row).includes('Mobilization note'),
    )!;
    expect(text(note.querySelector('dd')!)).toContain('Not recorded');
  });

  it('a non-owner reads the other section as values while it is open (CF-101 AC1)', async () => {
    const { element: commercial } = await render(recordedCloseout(PM_ACCESS), 'commercial');
    expect(
      commercial.querySelectorAll('.pf-panel input, .pf-panel select, .pf-panel textarea'),
    ).toHaveLength(0);
    expect(text(commercial.querySelector('dl.pf-readonly')!)).toContain('555,000.00 QAR');
    TestBed.resetTestingModule();
    const { element: schedule } = await render(recordedCloseout(PM_ACCESS), 'schedule');
    expect(schedule.querySelector('#field-actual_start_date')).not.toBeNull();
    expect(schedule.querySelector('dl.pf-readonly')).toBeNull();
  });

  it('a field disabled during a save keeps the disabled look (CF-101 AC1)', async () => {
    const { page, element } = await render(recordedCloseout(PM_ACCESS), 'quality');
    page.componentInstance.saving.set('execution');
    page.detectChanges();
    await page.whenStable();
    page.detectChanges();
    const fieldset = element.querySelector<HTMLFieldSetElement>('fieldset.pf-fieldset')!;
    expect(fieldset.disabled).toBe(true);
    expect(fieldset.classList).not.toContain('pf-readonly');
    expect(element.querySelector('dl.pf-readonly')).toBeNull();
  });

  it('names the roles that may reopen, from the permission matrix (CF-101 AC2)', async () => {
    const roleRequest = '/api/v1/access/role-holders?permission=Performance.Reopen';
    const closed = closedCloseout({ ...PM_ACCESS, editExecution: false, editCommercial: false });
    const notice = (element: HTMLElement) =>
      [...element.querySelectorAll('[data-testid="closed-notice"]')].map((node) =>
        text(node).trim(),
      );
    const cases: [readonly string[], string][] = [
      [['CompanyAdmin'], 'Only Company Admin can reopen it, with a reason, to correct it.'],
      // The matrix changes, the copy follows: no role is hard-coded.
      [
        ['CompanyAdmin', 'ProcurementManager'],
        'Only Company Admin or Procurement Manager can reopen it, with a reason, to correct it.',
      ],
      [[], 'No role in your company can reopen it; contact support.'],
    ];
    for (const [roles, expected] of cases) {
      for (const step of ['schedule', 'review']) {
        TestBed.resetTestingModule();
        const { http, page, element } = await render(closed, step);
        expect(notice(element)).toEqual(['This closeout is closed and read only.']);
        http.expectOne(roleRequest).flush({ permission: 'Performance.Reopen', roles });
        page.detectChanges();
        expect(notice(element), `${step} ${roles}`).toEqual([expect.stringContaining(expected)]);
        expect(notice(element)[0]).toContain('This closeout is closed and read only.');
      }
    }
    // A failed read leaves the role names out.
    TestBed.resetTestingModule();
    const failed = await render(closed, 'schedule');
    failed.http.expectOne(roleRequest).flush(null, { status: 500, statusText: 'Error' });
    failed.page.detectChanges();
    expect(notice(failed.element)).toEqual(['This closeout is closed and read only.']);
    // A reader who may reopen is told so, and no role is asked for.
    TestBed.resetTestingModule();
    const reopener = await render(
      closedCloseout({ ...PM_ACCESS, editExecution: false, finalize: false, reopen: true }),
      'schedule',
    );
    expect(notice(reopener.element)).toEqual([
      'This closeout is closed and read only. You can reopen it from Review and close.',
    ]);
    reopener.http.expectNone(roleRequest);
  });

  it('keeps finalized versions and the lifecycle on record', async () => {
    const { element } = await render(closedCloseout(PM_ACCESS), 'history');
    expect(text(element)).toContain('Version 1');
    expect(text(element)).toContain('Current history');
    expect(text(element)).toContain('Finalized as version 1');
    expect(text(element)).toContain('Verified');
  });
});

describe('Closeouts list', () => {
  it('lists awards with their closeout state and filters on the server', () => {
    const http = configure();
    const list = TestBed.createComponent(CloseoutsList);
    list.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/performance/closeouts')
      .flush({
        items: [
          {
            awardId: 'a1',
            tenderReference: 'TND-2026-0007',
            projectCode: 'P-100',
            workPackageCode: 'WP-HVAC',
            workPackageTitle: 'HVAC supply and install',
            category: null,
            subcontractorId: 's1',
            subcontractorCode: 'ACME-01',
            subcontractorName: 'ACME Contracting',
            awardedAtUtc: '2026-03-01T09:00:00Z',
            awardValue: '500000.00',
            currency: 'QAR',
            lifecycle: 'Pending',
            recorded: 0,
            required: 9,
            closedAtUtc: null,
            updatedAtUtc: null,
          },
        ],
        page: 1,
        pageSize: 24,
        totalCount: 1,
        totalPages: 1,
      });
    list.detectChanges();
    const element = list.nativeElement as HTMLElement;
    expect(text(element)).toContain('Closeout pending');
    expect(text(element)).toContain('No category');
    expect(text(element)).toContain('0 / 9 required items recorded');
    list.componentInstance.status = 'Closed';
    list.componentInstance.applyFilter();
    const filtered = http.expectOne((request) => request.url === '/api/v1/performance/closeouts');
    expect(filtered.request.params.get('status')).toBe('Closed');
  });

  it('holds the past outcomes as a tab of the closeout records (CF-012 AC2)', () => {
    configure();
    const list = TestBed.createComponent(CloseoutsList);
    list.detectChanges();
    const tabs = (list.nativeElement as HTMLElement).querySelector('nav.pf-record-tabs')!;
    expect(tabs.getAttribute('aria-label')).toBe('Closeout records');
    const links = [...tabs.querySelectorAll('a')];
    expect(links.map((link) => [link.getAttribute('href'), text(link).trim()])).toEqual([
      ['/closeouts', 'Closeouts'],
      ['/retrospective-outcomes', 'Past outcomes'],
    ]);
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual(['page', null]);
  });
});

describe('Subcontractor performance history', () => {
  function history$(response: object) {
    const http = configure();
    const view = TestBed.createComponent(SubcontractorPerformanceView);
    view.componentRef.setInput('subcontractorId', 's1');
    view.detectChanges();
    http.expectOne('/api/v1/performance/subcontractors/s1').flush(response);
    view.detectChanges();
    return view.nativeElement as HTMLElement;
  }

  it('leads with sample size and recency and warns about a small sample instead of a precise score', () => {
    const element = history$(history());
    const shown = text(element);
    expect(shown).toContain('Mechanical');
    expect(shown).toContain('1 completed project');
    // Closeout dates are instants, shown in UTC like every instant in the product (never a blank dash).
    expect(shown).toContain('most recent closeout Sep 25, 2026');
    expect(shown).toContain('A small sample');
    expect(shown).toContain('5.00 / 5');
    expect(shown).toContain('+11.00 %');
    expect(shown).toContain('closeouts in progress: 1');
    expect(shown).not.toMatch(/score/i);
  });

  it('shows plural sample sizes and the empty state', () => {
    expect(text(history$(history([mechanical(3)])))).toContain('3 completed projects');
    TestBed.resetTestingModule();
    expect(text(history$(history([])))).toContain('No completed project yet');
  });
});

describe('Historical evidence in a recommendation', () => {
  it('shows the score the engine used only with its sample size, category and recency — or says there is none', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const view = TestBed.createComponent(HistoryEvidence);
    view.componentRef.setInput('history', {
      score: '90',
      sampleSize: 1,
      earliestOutcomeAtUtc: '2026-09-25T09:00:00Z',
      latestOutcomeAtUtc: '2026-09-25T09:00:00Z',
      category: 'Mechanical',
      scoreRule: 'performance-outcome-v1',
      outcomes: [
        {
          awardId: 'a1',
          versionNumber: 1,
          tenderReference: 'TND-2026-0007',
          closedAtUtc: '2026-09-25T09:00:00Z',
          costVariancePercent: '11.00',
          scheduleVariancePercent: '20.00',
          qualityRating: 5,
          hseRating: 4,
          variationCount: 7,
          claimCount: 1,
          disputeCount: 0,
          wouldWorkAgain: 'Yes',
          outcomeScore: '89.68',
        },
      ],
    });
    view.componentRef.setInput('applied', true);
    view.detectChanges();
    const shown = text(view.nativeElement as HTMLElement);
    // CF-023 (ADR-127): a composite with its rule, beside the components below it.
    expect(shown).toContain('the input this recommendation weighed: 90 / 100');
    expect(shown).toContain('1 completed project');
    expect(shown).toContain('Mechanical');
    expect(shown).toContain('cost +11.00 %');
    expect(shown).toContain('latest closeout Sep 25, 2026');
    // The same evidence under a policy that did not apply history says so.
    view.componentRef.setInput('applied', false);
    view.detectChanges();
    expect(text(view.nativeElement as HTMLElement)).toContain('not used in this ranking');
    view.componentRef.setInput('history', null);
    view.detectChanges();
    expect(text(view.nativeElement as HTMLElement)).toContain('no history is invented');
  });
});

describe('The firm profile from a recommendation (CF-026)', () => {
  it('opens the firm intelligence in the evidence category, for intelligence readers only', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const session = TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    };
    (
      TestBed.inject(EntitlementsService) as unknown as {
        current: { set: (value: readonly string[]) => void };
      }
    ).current.set(['intelligence', ...PERFORMANCE_FEATURES]);
    const evidence = {
      score: '90',
      sampleSize: 2,
      earliestOutcomeAtUtc: '2026-08-25T09:00:00Z',
      latestOutcomeAtUtc: '2026-09-25T09:00:00Z',
      category: 'Mechanical',
      scoreRule: 'performance-outcome-v3',
      outcomes: [],
    };
    const links = (permissions: string[]) => {
      session.currentIdentity.set({
        userId: 'u1',
        tenantId: 't',
        roles: ['ProcurementManager'],
        permissions,
      });
      const view = TestBed.createComponent(HistoryEvidence);
      view.componentRef.setInput('history', evidence);
      view.componentRef.setInput('subcontractorId', 's1');
      view.detectChanges();
      return [...(view.nativeElement as HTMLElement).querySelectorAll('a')]
        .filter((link) => text(link).includes('intelligence in this category'))
        .map((link) => link.getAttribute('href'));
    };
    expect(links(['Decision.View', 'Intelligence.View'])).toEqual([
      '/subcontractors/s1?category=Mechanical',
    ]);
    expect(links(['Decision.View'])).toEqual([]);
  });
});

describe('Commercial outcomes follow commercial visibility (CF-073)', () => {
  it('shows a closeout without its money when the server withholds it, and says why', async () => {
    const recorded = recordedCloseout();
    const { element } = await render({
      ...recorded,
      commercialVisible: false,
      baseline: { ...recorded.baseline, awardValue: null },
      commercial: { ...recorded.commercial, actualFinalCost: null, costExplanation: null },
      metrics: {
        ...recorded.metrics,
        awardValue: null,
        actualFinalCost: null,
        costVarianceAmount: null,
        costVariancePercent: null,
      },
    });
    const shown = text(element);
    expect(shown).toContain('shown to commercial roles and to the Project Manager assigned');
    expect(shown).not.toContain('500,000.00 QAR');
    expect(shown).not.toContain('Over the award value');
    // Execution evidence stays.
    expect(shown).toContain('108 days');
  });

  it('lists a restricted award value as restricted, never as a dash', () => {
    const http = configure();
    const list = TestBed.createComponent(CloseoutsList);
    list.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/performance/closeouts')
      .flush({
        items: [
          {
            awardId: 'a1',
            tenderReference: 'TND-2026-0007',
            projectCode: 'P-100',
            workPackageCode: 'WP-HVAC',
            workPackageTitle: 'HVAC supply and install',
            category: null,
            subcontractorId: 's1',
            subcontractorCode: 'ACME-01',
            subcontractorName: 'ACME Contracting',
            awardedAtUtc: '2026-03-01T09:00:00Z',
            awardValue: null,
            currency: 'QAR',
            lifecycle: 'Pending',
            recorded: 0,
            required: 9,
            closedAtUtc: null,
            updatedAtUtc: null,
          },
        ],
        page: 1,
        pageSize: 24,
        totalCount: 1,
        totalPages: 1,
      });
    list.detectChanges();
    const shown = text(list.nativeElement as HTMLElement);
    expect(shown).toMatch(/Award value\s*Restricted/);
    expect(shown).not.toContain('— QAR');
  });

  it('keeps cross-project history to delivery evidence for a reader without commercial visibility', () => {
    const http = configure();
    const view = TestBed.createComponent(SubcontractorPerformanceView);
    view.componentRef.setInput('subcontractorId', 's1');
    view.detectChanges();
    const full = history();
    http.expectOne('/api/v1/performance/subcontractors/s1').flush({
      ...full,
      commercialVisible: false,
      categories: full.categories.map((category) => ({
        ...category,
        costVarianceMin: null,
        costVarianceMax: null,
        outcomes: category.outcomes.map((outcome) => ({
          ...outcome,
          awardValue: null,
          actualFinalCost: null,
          costVariancePercent: null,
        })),
      })),
    });
    view.detectChanges();
    const shown = text(view.nativeElement as HTMLElement);
    expect(shown).toContain('shown to commercial roles only');
    expect(shown).not.toContain('Final cost vs award value');
    expect(shown).not.toContain('Actual final cost');
    expect(shown).toContain('5.00 / 5');
  });
});
