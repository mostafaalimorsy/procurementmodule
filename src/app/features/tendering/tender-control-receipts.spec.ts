import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { TenderControl } from './tender-control';
import { TenderBidReceipt } from './tendering.api';
import { published } from './tendering.fixtures';

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ');

/** CF-100 AC4 (B-100-4): a submitted bid's fingerprint on the control centre is collapsed, and whole when opened. */
describe('Bid receipts on the tender control centre (CF-100)', () => {
  it('keeps each receipt fingerprint collapsed under Verification details and shows the full hash when opened', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['ProcurementManager'],
      permissions: ['Tenders.View'],
    });
    const http = TestBed.inject(HttpTestingController);
    const control = TestBed.createComponent(TenderControl);
    control.componentRef.setInput('tender', published());
    control.detectChanges();
    const hash = 'fedcba9876543210'.repeat(4);
    const receipt: TenderBidReceipt = {
      invitationId: 'i1',
      subcontractorCode: 'ACME-01',
      subcontractorName: 'ACME Contracting',
      invitationStatus: 'BidSubmitted',
      bidReference: 'BID-7K4Q-M2XD',
      bidStatus: 'Submitted',
      startedAtUtc: '2026-10-02T09:00:00Z',
      submittedAtUtc: '2026-10-03T10:00:00Z',
      revisionNumber: 1,
      submittedAttachmentCount: 2,
      contentSha256: hash,
      receiptEmailStatus: 'Sent',
    };
    const started: TenderBidReceipt = {
      ...receipt,
      invitationId: 'i2',
      subcontractorCode: 'BETA-02',
      subcontractorName: 'Beta Works',
      invitationStatus: 'BidStarted',
      bidReference: null,
      bidStatus: 'Draft',
      submittedAtUtc: null,
      submittedAttachmentCount: null,
      contentSha256: null,
      receiptEmailStatus: null,
    };
    http
      .match((request) => request.url.endsWith('/bids'))
      .forEach((request) =>
        request.flush({
          invited: 2,
          inProgress: 1,
          submitted: 1,
          contentSealed: true,
          receipts: [receipt, started],
        }),
      );
    control.detectChanges();
    const element = control.nativeElement as HTMLElement;
    expect(text(element)).toContain('ACME-01');
    // Only the submitted bid has a fingerprint; a started draft has none to show.
    const all = [...element.querySelectorAll('app-verification-details details')];
    expect(all).toHaveLength(1);
    const details = all[0] as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(text(details.querySelector('summary')!).trim()).toBe('Verification details');
    details.open = true;
    const code = details.querySelector('code[dir="ltr"]') as HTMLElement;
    expect(code.textContent?.trim()).toBe(hash);
    expect(code.textContent?.trim()).toMatch(/^[0-9a-f]{64}$/);
  });
});
