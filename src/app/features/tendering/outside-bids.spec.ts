import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { OutsideBidsPanel } from './outside-bids';
import { OutsideBidIntake } from './tendering.api';
import { published } from './tendering.fixtures';

/** CF-058 (ADR-102, OD-11): recording a bid received outside the portal, and its confirmation by a second user. */
function render(permissions: readonly string[]) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({ userId: 'u1', tenantId: 't', roles: [], permissions });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(OutsideBidsPanel);
  fixture.componentRef.setInput('tender', published());
  fixture.detectChanges();
  return {
    http,
    fixture,
    element: fixture.nativeElement as HTMLElement,
    page: fixture.componentInstance,
  };
}

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

const intake = (overrides: Partial<OutsideBidIntake> = {}): OutsideBidIntake => ({
  id: 'i1',
  invitationId: 'inv1',
  subcontractorCode: 'ACME-01',
  subcontractorName: 'Acme Mechanical',
  bidReference: 'BID-7K4Q-M2XD',
  revisionNumber: 1,
  channel: 'Email',
  receivedAtUtc: '2026-10-02T10:05:00Z',
  attestation: 'Received by email from the estimator.',
  recordedByName: 'Maha Manager',
  recordedAtUtc: '2026-10-02T11:00:00Z',
  confirmedByName: null,
  confirmedAtUtc: null,
  canConfirm: true,
  content: { totalAmount: '1250000.00', validityDays: 90, durationDays: 120 },
  files: [
    {
      id: 'f1',
      fileName: 'boq.pdf',
      sizeBytes: 100,
      requirementLabel: 'Priced BOQ',
      sha256: 'a'.repeat(64),
    },
  ],
  version: 'v1',
  sealed: false,
  ...overrides,
});

describe('Bids received outside the portal (CF-058)', () => {
  it('records a bid with its attestation and files, then a second user confirms the transcription', () => {
    const { http, fixture, element, page } = render(['Tenders.View', 'Tenders.Publish']);
    http
      .expectOne('/api/v1/tenders/t1/outside-bids')
      .flush({ enabled: true, canRecord: true, intakes: [] });
    fixture.detectChanges();
    expect(text(element)).toContain('Record a bid received outside the portal');
    page.invitationId = 'inv1';
    page.receivedAt = '2026-10-02T13:05';
    page.attestation = 'Received by email from the estimator.';
    page.total = '1250000';
    page.pick('Priced BOQ', {
      target: { files: [new File(['%PDF-1.7'], 'boq.pdf')] },
    } as unknown as Event);
    page.record();
    const request = http.expectOne('/api/v1/tenders/t1/outside-bids');
    const body = request.request.body as FormData;
    expect([body.get('invitationId'), body.get('channel'), body.get('requirement')]).toEqual([
      'inv1',
      'Email',
      'Priced BOQ',
    ]);
    expect(JSON.parse(String(body.get('content'))).totalAmount).toBe('1250000');
    request.flush({ enabled: true, canRecord: true, intakes: [intake({ canConfirm: false })] });
    fixture.detectChanges();
    expect(text(element)).toContain('Waiting for another user to confirm the transcription.');
    TestBed.resetTestingModule();

    const second = render(['Tenders.View', 'Tenders.Publish']);
    second.http
      .expectOne('/api/v1/tenders/t1/outside-bids')
      .flush({ enabled: true, canRecord: true, intakes: [intake()] });
    second.fixture.detectChanges();
    second.page.confirm(intake());
    const confirm = second.http.expectOne('/api/v1/tenders/t1/outside-bids/i1/confirm');
    expect(confirm.request.body).toEqual({ version: 'v1' });
    confirm.flush({
      enabled: true,
      canRecord: true,
      intakes: [
        intake({
          confirmedByName: 'Omar Manager',
          confirmedAtUtc: '2026-10-02T12:00:00Z',
          canConfirm: false,
          // Re-audit R-06: confirmed before the opening, it is sealed like any bid.
          content: null,
          files: [],
          sealed: true,
        }),
      ],
    });
    second.fixture.detectChanges();
    expect(text(second.element)).toContain('Transcription confirmed by Omar Manager');
    expect(text(second.element)).toContain('Confirmed and sealed');
    expect(text(second.element)).not.toContain('1250000');
    expect(second.element.querySelector('a[download]')).toBeNull();
  });

  it('shows nothing when the company has not turned it on', () => {
    const { http, fixture, element } = render(['Tenders.View']);
    http
      .expectOne('/api/v1/tenders/t1/outside-bids')
      .flush({ enabled: false, canRecord: false, intakes: [] });
    fixture.detectChanges();
    expect(text(element)).not.toContain('Bids received outside the portal');
  });
});
