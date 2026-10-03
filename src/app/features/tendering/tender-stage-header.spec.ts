import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { TenderPage, TenderStageHeader } from './tender-stage-header';
import { TenderStageView } from './tendering.api';

const ALL = [
  'projects',
  'subcontractor_directory',
  'sourcing',
  'tendering',
  'evaluation',
  'award',
  'performance',
];
const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

function render(
  view: Partial<TenderStageView>,
  permissions: readonly string[],
  page: TenderPage = 'tender',
) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', children: [] }]),
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
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(EntitlementsService).load().subscribe();
  http.expectOne('/api/v1/company/features').flush({ features: ALL });
  const fixture = TestBed.createComponent(TenderStageHeader);
  fixture.componentRef.setInput('tenderId', 't1');
  fixture.componentRef.setInput('page', page);
  fixture.detectChanges();
  http.expectOne('/api/v1/tenders/t1/stage').flush({
    tenderId: 't1',
    reference: 'TND-2026-0001',
    title: 'HVAC',
    stage: 'Opened',
    lifecycle: 'Opened',
    awardId: null,
    ...view,
  });
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const current = element.querySelector('[aria-current="step"]')?.textContent?.trim() ?? null;
  const hrefs = [...element.querySelectorAll('a')].map((link) => link.getAttribute('href'));
  http.verify();
  return { element, current, hrefs, shown: text(element) };
}

describe('Tender stage header (CF-015)', () => {
  it('marks the stage the server derived, for every step', () => {
    const cases: [string, string, string | null][] = [
      ['Draft', 'Draft', 'Bidding'],
      ['OpenForBids', 'OpenForBids', 'Bidding'],
      ['AwaitingOpening', 'AwaitingOpening', 'Opening'],
      ['Opened', 'InNegotiation', 'Evaluation'],
      ['Opened', 'EvaluationRefresh', 'Evaluation'],
      ['Opened', 'ReadyForDecision', 'Decision'],
      ['Opened', 'AwaitingApproval', 'Decision'],
      ['Awarded', 'AwaitingAnswer', 'Award'],
      ['Awarded', 'CloseoutFinalized', 'Closeout'],
      ['Cancelled', 'Cancelled', null],
    ];
    for (const [stage, lifecycle, pill] of cases) {
      const { current } = render({ stage: stage as TenderStageView['stage'], lifecycle }, [
        'Tenders.View',
      ]);
      expect(current).toBe(pill);
      TestBed.resetTestingModule();
    }
  });

  it('offers the next action to a reader who may take it, and names the role to anyone else', () => {
    const approver = render({ lifecycle: 'AwaitingApproval' }, [
      'Tenders.View',
      'Decision.View',
      'Award.Approve',
    ]);
    expect(approver.hrefs).toContain('/tenders/t1/decision?tab=approval');
    TestBed.resetTestingModule();
    const officer = render({ lifecycle: 'AwaitingApproval' }, ['Tenders.View']);
    expect(officer.shown).toContain('Next: Approver / Director');
    expect(officer.hrefs.some((href) => href?.includes('/decision'))).toBe(false);
    TestBed.resetTestingModule();
    // On the page that is itself the next step, no link to itself.
    const onDecision = render(
      { lifecycle: 'ReadyForDecision' },
      ['Tenders.View', 'Decision.View', 'Decision.Prepare'],
      'decision',
    );
    expect(onDecision.hrefs).toEqual([]);
  });

  it('reaches the award and the closeout in one click after the award, for their readers', () => {
    const reader = render(
      { stage: 'Awarded', lifecycle: 'CloseoutInProgress', awardId: 'a1' },
      ['Tenders.View', 'Decision.View', 'Performance.View'],
      'evaluation',
    );
    expect(reader.hrefs).toContain('/tenders/t1/decision?tab=award');
    expect(reader.hrefs).toContain('/closeouts/a1');
    TestBed.resetTestingModule();
    const other = render({ stage: 'Awarded', lifecycle: 'Awarded', awardId: null }, [
      'Tenders.View',
    ]);
    expect(other.hrefs).toEqual([]);
  });
});
