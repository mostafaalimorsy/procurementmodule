import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GovernanceSettings } from './governance-settings';
import { ProcurementGovernance } from './company.api';

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');
const defaults = (overrides: Partial<ProcurementGovernance> = {}): ProcurementGovernance => ({
  companyAdminActsInProcurement: false,
  minimumCompliantBids: 2,
  overBudgetTolerancePercent: '0',
  validityBasis: 'SubmissionDeadline',
  pricingBasisRequired: false,
  isDefault: true,
  canManage: true,
  updatedAtUtc: null,
  version: '00000000-0000-0000-0000-000000000000',
  ...overrides,
});

function render(current: ProcurementGovernance) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(GovernanceSettings);
  fixture.detectChanges();
  http.expectOne('/api/v1/company/governance').flush(current);
  fixture.detectChanges();
  return { http, fixture, element: fixture.nativeElement as HTMLElement };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('procurement governance settings (ADR-084)', () => {
  it('shows the new-company defaults and saves the chosen terms with the version', async () => {
    const { http, fixture, element } = render(defaults());
    await settle();
    fixture.detectChanges();
    expect(text(element)).toContain('Your company uses the standard settings');
    const acts = element.querySelector('input[name="companyAdminActs"]') as HTMLInputElement;
    expect(acts.checked).toBe(false);
    acts.click();
    fixture.detectChanges();
    const tolerance = element.querySelector('#gov-tolerance') as HTMLInputElement;
    tolerance.value = '5.5';
    tolerance.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (element.querySelector('.prj-form-actions button') as HTMLButtonElement).click();
    const request = http.expectOne('/api/v1/company/governance');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      companyAdminActsInProcurement: true,
      minimumCompliantBids: 2,
      overBudgetTolerancePercent: '5.5',
      validityBasis: 'SubmissionDeadline',
      pricingBasisRequired: false,
      // CF-130 (ADR-097): four eyes, off unless chosen.
      requireIndependentShortlistApproval: false,
      requireIndependentPublish: false,
      // CF-057 (ADR-098): the fast path, off unless set.
      fastPathEnabled: false,
      fastPathMaximumValue: null,
      fastPathCurrency: null,
      // CF-045 (ADR-099): the default revision limit is sent back unchanged.
      maximumBidResubmissions: 3,
      // CF-086 (ADR-101): the bid periods, unchanged defaults.
      minimumBidPeriodHours: 1,
      normalBidPeriodDays: 5,
      // CF-058 (ADR-102): outside-portal intake stays off.
      outsidePortalBidsAllowed: false,
      // CF-040 (ADR-105): criteria declaration stays off.
      criteriaDeclaration: 'NotRequired',
      // CF-043 (ADR-106): the panel defaults.
      minimumScorecardsPerBid: 1,
      divergenceThresholdPoints: 20,
      moderationRequired: false,
      // CF-047 (ADR-111): "not selected" notices wait for the acceptance unless chosen otherwise.
      outcomeNoticeTiming: 'OnAcceptance',
      // CF-010: no target durations unless set (0 = none).
      evaluationTargetDays: 0,
      approvalTargetDays: 0,
      closeoutTargetDays: 0,
      version: '00000000-0000-0000-0000-000000000000',
    });
    request.flush(
      defaults({
        companyAdminActsInProcurement: true,
        overBudgetTolerancePercent: '5.5',
        isDefault: false,
        version: 'v2',
      }),
    );
    // The Company Admin setting changes what this session may do: the session is read again.
    http.expectOne('/api/v1/session').flush(null);
    fixture.detectChanges();
    expect(text(element)).toContain('Governance settings saved');
  });

  it('saves when the firms not selected are told (CF-047)', async () => {
    const { http, fixture, element } = render(defaults({ outcomeNoticeTiming: 'OnAcceptance' }));
    await settle();
    fixture.detectChanges();
    expect(text(element)).toContain('Tell the firms not selected');
    const timing = element.querySelector('#gov-notice-timing') as HTMLSelectElement;
    timing.value = 'AtAward';
    timing.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    (element.querySelector('.prj-form-actions button') as HTMLButtonElement).click();
    const request = http.expectOne('/api/v1/company/governance');
    expect(request.request.body.outcomeNoticeTiming).toBe('AtAward');
    request.flush(defaults({ outcomeNoticeTiming: 'AtAward', version: 'v2' }));
  });

  it('sends target durations, an emptied one as none (CF-010)', async () => {
    const { http, fixture, element } = render(
      defaults({ approvalTargetDays: 3, closeoutTargetDays: 30 }),
    );
    await settle();
    fixture.detectChanges();
    const set = (selector: string, value: string) => {
      const input = element.querySelector(selector) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    set('#gov-target-evaluation', '10');
    set('#gov-target-approval', '');
    fixture.detectChanges();
    (element.querySelector('.prj-form-actions button') as HTMLButtonElement).click();
    const request = http.expectOne('/api/v1/company/governance');
    expect(request.request.body).toMatchObject({
      evaluationTargetDays: 10,
      approvalTargetDays: 0,
      closeoutTargetDays: 30,
    });
    request.flush(defaults({ evaluationTargetDays: 10, closeoutTargetDays: 30, version: 'v2' }));
  });

  it('is read-only for members who cannot manage it', async () => {
    const { fixture, element } = render(defaults({ canManage: false, isDefault: false }));
    await settle();
    fixture.detectChanges();
    expect(
      (element.querySelector('input[name="companyAdminActs"]') as HTMLInputElement).disabled,
    ).toBe(true);
    expect(element.querySelector('.prj-form-actions button')).toBeNull();
  });
});
