import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { KNOWN_PROBLEM_CODES } from '../../core/localization/product-problem';
import { RetrospectiveImport } from './retrospective-import';
import { RetrospectiveList } from './retrospective-list';
import { RetrospectivePage } from './retrospective-page';
import { RetrospectiveOutcome } from './retrospective.api';

// CF-002 (ADR-126): past outcomes recorded from documents — labelled everywhere, confirmed by someone who recorded none of it.

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ');
const button = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll('button')].find((candidate) => text(candidate).includes(label)) as
    HTMLButtonElement | undefined;

function configure(id: string | null, permissions: string[]) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } },
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

function record(overrides: Partial<RetrospectiveOutcome> = {}): RetrospectiveOutcome {
  return {
    id: 'r1',
    subcontractorId: 's1',
    subcontractorCode: 'ACME-01',
    subcontractorName: 'ACME Contracting',
    tradeId: 't1',
    category: 'HVAC',
    projectLabel: 'Riyadh Metro Line 3',
    packageLabel: 'HVAC package B',
    currency: 'QAR',
    sourceReference: 'Final account FA-2025-11',
    imported: false,
    status: 'Draft',
    version: 'v1',
    currentVersionNumber: 0,
    recordedAtUtc: '2026-10-01T08:00:00Z',
    createdByName: 'Quinn QS',
    confirmedAtUtc: null,
    confirmedByName: null,
    commercial: {
      awardValue: '500000.00',
      actualFinalCost: '540000.00',
      variationValue: '30000.00',
      variationCause: 'ClientChange',
      sectionVersion: 'c1',
      updatedAtUtc: '2026-10-01T08:10:00Z',
      updatedByName: 'Quinn QS',
    },
    execution: {
      plannedDurationDays: 90,
      actualStartDate: '2025-01-05',
      actualCompletionDate: '2025-04-30',
      qualityRating: 4,
      hseRating: 5,
      wouldWorkAgain: 'Yes',
      wouldWorkAgainRationale: null,
      outcomeType: 'Completed',
      percentComplete: null,
      sectionVersion: 'e1',
      updatedAtUtc: '2026-10-01T08:20:00Z',
      updatedByName: 'Pat Manager',
    },
    completeness: { complete: true, recorded: 9, required: 9, missing: [] },
    versions: [],
    events: [
      {
        kind: 'Created',
        versionNumber: 0,
        atUtc: '2026-10-01T08:00:00Z',
        actorName: 'Quinn QS',
        reason: null,
      },
    ],
    access: { editCommercial: false, editExecution: false, confirm: true, correct: false },
    commercialVisible: true,
    ...overrides,
  };
}

describe('Past outcomes (retrospective)', () => {
  it('explains every retrospective refusal', () => {
    for (const code of [
      'retrospective.incomplete',
      'retrospective.attestation_required',
      'retrospective.self_confirmation',
      'retrospective.already_confirmed',
      'retrospective.not_confirmed',
      'retrospective.confirmed_read_only',
      'retrospective.trade_required',
      'retrospective.import_unknown_firm',
      'retrospective.import_value_invalid',
      'retrospective.import_rows_invalid',
    ])
      expect(KNOWN_PROBLEM_CODES).toContain(code);
  });

  it('labels the record and confirms only with the attestation', async () => {
    const http = configure('r1', ['Performance.View', 'Sourcing.ApproveShortlist']);
    const page = TestBed.createComponent(RetrospectivePage);
    page.detectChanges();
    http.expectOne('/api/v1/performance/retrospective-outcomes/r1').flush(record());
    page.detectChanges();
    await page.whenStable();
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    expect(text(element.querySelector('[data-testid="retro-badge"]')!)).toContain(
      'Retrospective — not system-evidenced',
    );
    const confirm = button(element, 'Confirm the past outcome')!;
    expect(confirm.disabled).toBe(true);
    const attest = element.querySelector<HTMLInputElement>('#retro-attest')!;
    attest.checked = true;
    attest.dispatchEvent(new Event('change'));
    page.detectChanges();
    await page.whenStable();
    page.detectChanges();
    expect(confirm.disabled).toBe(false);
    confirm.click();
    const request = http.expectOne('/api/v1/performance/retrospective-outcomes/r1/confirm');
    expect(request.request.body).toEqual(
      expect.objectContaining({ version: 'v1', attested: true }),
    );
    request.flush(
      record({
        status: 'Confirmed',
        currentVersionNumber: 1,
        access: { editCommercial: false, editExecution: false, confirm: false, correct: true },
        versions: [
          {
            number: 1,
            authoritative: true,
            confirmedAtUtc: '2026-10-01T09:00:00Z',
            confirmedByName: 'Morgan Manager',
            createdByName: 'Quinn QS',
            commercialRecordedByName: 'Quinn QS',
            executionRecordedByName: 'Pat Manager',
            awardValue: '500000.00',
            actualFinalCost: '540000.00',
            costVariancePercent: '8.00',
            actualDurationDays: 116,
            scheduleVariancePercent: '28.89',
            qualityRating: 4,
            hseRating: 5,
            wouldWorkAgain: 'Yes',
            outcomeType: 'Completed',
            correctionReason: null,
            sha256: 'a'.repeat(64),
            fingerprintVerified: true,
          },
        ],
      }),
    );
    page.detectChanges();
    expect(text(element)).toContain('Confirmed by Morgan Manager');
    expect(text(element)).toContain('Verified');
    http.verify();
  });

  it('tells a recorder who may not confirm who does', async () => {
    const http = configure('r1', ['Performance.View', 'Performance.EditCommercial']);
    const page = TestBed.createComponent(RetrospectivePage);
    page.detectChanges();
    http.expectOne('/api/v1/performance/retrospective-outcomes/r1').flush(
      record({
        access: { editCommercial: true, editExecution: false, confirm: false, correct: false },
      }),
    );
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    expect(button(element, 'Confirm the past outcome')).toBeUndefined();
    expect(text(element)).toContain('Procurement leadership who recorded none of it confirms');
    http.verify();
  });

  it('lists past outcomes with their label and offers recording only to section owners', () => {
    const http = configure(null, ['Performance.View']);
    const list = TestBed.createComponent(RetrospectiveList);
    list.detectChanges();
    // CF-012 AC2: the page is the second tab of the closeout records.
    const tabs = [
      ...(list.nativeElement as HTMLElement).querySelectorAll('nav.pf-record-tabs a'),
    ].map((link) => [link.getAttribute('href'), link.getAttribute('aria-current')]);
    expect(tabs).toEqual([
      ['/closeouts', null],
      ['/retrospective-outcomes', 'page'],
    ]);
    http
      .expectOne((request) => request.url === '/api/v1/performance/retrospective-outcomes')
      .flush({
        items: [
          {
            id: 'r1',
            subcontractorId: 's1',
            subcontractorCode: 'ACME-01',
            subcontractorName: 'ACME Contracting',
            category: 'HVAC',
            projectLabel: 'Riyadh Metro Line 3',
            packageLabel: 'HVAC package B',
            status: 'Draft',
            currentVersionNumber: 0,
            recorded: 9,
            required: 9,
            imported: true,
            updatedAtUtc: '2026-10-01T08:20:00Z',
          },
        ],
        page: 1,
        pageSize: 24,
        totalCount: 1,
      });
    list.detectChanges();
    const element = list.nativeElement as HTMLElement;
    expect(text(element)).toContain('Retrospective — not system-evidenced');
    expect(text(element)).toContain('Awaiting confirmation');
    expect(text(element)).toContain('Imported');
    expect(text(element)).not.toContain('Record a past outcome');
    http.verify();
  });

  it('checks an import file, shows each refused row and confirms by the checked hash', () => {
    const http = configure(null, ['Performance.View', 'Performance.EditCommercial']);
    const page = TestBed.createComponent(RetrospectiveImport);
    page.detectChanges();
    const file = new File(['subcontractor_code\r\n'], 'history.csv', { type: 'text/csv' });
    page.componentInstance.choose({ target: { files: [file] } } as unknown as Event);
    page.componentInstance.check();
    http.expectOne('/api/v1/performance/retrospective-outcomes/import/preview').flush({
      sha256: 'f'.repeat(64),
      format: 'Csv',
      rows: 2,
      toCreate: 1,
      duplicates: 0,
      errors: 1,
      fileIssues: [],
      items: [
        {
          row: 2,
          subcontractorCode: 'ACME-01',
          tradeCode: 'HVAC',
          projectLabel: 'Doha tower',
          outcome: 'Create',
          issues: [],
        },
        {
          row: 3,
          subcontractorCode: 'NOPE-1',
          tradeCode: 'HVAC',
          projectLabel: 'Doha tower',
          outcome: 'Error',
          issues: [{ code: 'retrospective.import_unknown_firm', column: 'subcontractor_code' }],
        },
      ],
      canConfirm: false,
    });
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    expect(text(element)).toContain(
      'No subcontractor in the directory has this code. (subcontractor_code)',
    );
    expect(text(element)).toContain('Correct the refused rows and check the file again.');
    expect(button(element, 'Import the new rows')).toBeUndefined();
    http.verify();
  });
});
