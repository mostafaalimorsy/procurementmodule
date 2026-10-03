import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { DecisionPack, PackState } from './decision.api';
import { award, decision, recommendation, submission } from './decision.fixtures';
import { DecisionPackPage } from './decision-pack';

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ');

function pack(
  state: PackState,
  shortlistBasis: DecisionPack['decision']['shortlistBasis'] = null,
): DecisionPack {
  const awarded = state === 'Awarded';
  return {
    header: {
      tenderReference: 'TND-2026-0009',
      tenderTitle: 'HVAC works',
      tenderRevision: 2,
      companyName: 'Delta Construction',
      generatedByName: 'Pam PM',
      generatedAtUtc: '2026-10-04T09:00:00Z',
      decisionVersion: state === 'NoDecision' ? null : 'dv1',
      openingFingerprint: 'a'.repeat(64),
      recommendationFingerprint: state === 'NoDecision' ? null : 'b'.repeat(64),
      baselineFingerprint: awarded ? 'c'.repeat(64) : null,
    },
    state,
    decision: decision({
      recommendation: state === 'NoDecision' ? null : recommendation(),
      currentSubmission: state === 'NoDecision' || state === 'Draft' ? null : submission(),
      award: awarded ? award() : null,
      shortlistBasis,
    }),
    openedBids: [
      {
        position: 1,
        subcontractorCode: 'ACME-01',
        subcontractorName: 'Acme Mechanical',
        bidReference: 'BID-AAAA-BBBB',
        revisionNumber: 1,
        currentRevisionNumber: 2,
        contentSha256: 'd'.repeat(64),
        withdrawnAfterOpening: false,
      },
    ],
  };
}

function render(
  state: PackState,
  shortlistBasis: DecisionPack['decision']['shortlistBasis'] = null,
) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 't1' }) } },
      },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(DecisionPackPage);
  fixture.detectChanges();
  http.expectOne('/api/v1/tenders/t1/decision/pack').flush(pack(state, shortlistBasis));
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Decision and award pack (CF-003)', () => {
  const marks: [PackState, string | null][] = [
    ['NoDecision', 'No decision yet — not approved'],
    ['Draft', 'Draft — not approved'],
    ['PendingApproval', 'Pending approval — not approved'],
    ['Returned', 'Returned for changes — not approved'],
    ['Approved', null],
    ['Awarded', null],
  ];
  for (const [state, mark] of marks) {
    it(`renders the ${state} pack with the right watermark`, () => {
      const element = render(state);
      const watermark = element.querySelector('.pack-watermark');
      if (mark) expect(text(watermark!)).toContain(mark);
      else expect(watermark).toBeNull();
      expect(text(element)).toContain('Decision and award pack');
      expect(text(element)).toContain('a'.repeat(64));
      expect(text(element)).toContain('Generated');
      if (state === 'Awarded') {
        expect(text(element)).toContain('Award baseline');
        expect(text(element)).toContain('c'.repeat(64));
      } else {
        expect(text(element)).not.toContain('Award baseline (SHA-256)');
      }
    });
  }

  it('keeps references, revisions and fingerprints left-to-right inside the page', () => {
    const element = render('Awarded');
    const ltr = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) => text(node));
    expect(ltr).toContain('TND-2026-0009');
    expect(ltr).toContain('1 / 2');
    expect(ltr).toContain('d'.repeat(64));
  });

  it('says on the file of record that the shortlist went through the low-value fast path (red-team G073)', () => {
    const basis = {
      approvalId: 'sa1',
      round: 1,
      fastPath: true,
      approvedByName: 'Omar Officer',
      approvedAtUtc: '2026-09-20T08:00:00Z',
    };
    const fast = render('Awarded', [basis]);
    const note = fast.querySelector('[data-testid="shortlist-basis"]') as HTMLElement;
    expect(text(note)).toContain(
      'Shortlist approved through the low-value fast path (approved vendors, one approver)',
    );
    expect(text(note)).toContain('Omar Officer');
    TestBed.resetTestingModule();
    const fourEyes = render('Awarded', [{ ...basis, fastPath: false }]);
    expect(fourEyes.querySelector('[data-testid="shortlist-basis"]')).toBeNull();
  });
});
