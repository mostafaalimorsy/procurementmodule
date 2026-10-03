import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { TenderControl } from './tender-control';
import { published } from './tendering.fixtures';

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');
const button = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll('button')].find((candidate) => text(candidate).includes(label)) as
    HTMLButtonElement | undefined;

function configure(permissions: readonly string[]) {
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
    permissions,
  });
  return TestBed.inject(HttpTestingController);
}

function render(permissions: readonly string[], overrides = {}) {
  const http = configure(permissions);
  const control = TestBed.createComponent(TenderControl);
  control.componentRef.setInput(
    'tender',
    published({ closureCounts: { invited: 3, submitted: 1, notSubmitted: 2 }, ...overrides }),
  );
  control.detectChanges();
  http
    .match((request) => request.url.endsWith('/bids'))
    .forEach((request) =>
      request.flush({ invited: 3, inProgress: 0, submitted: 1, contentSealed: true, receipts: [] }),
    );
  return { http, control, element: control.nativeElement as HTMLElement };
}

describe('Closing a tender early', () => {
  it('is offered only to procurement leadership while the tender is open', () => {
    expect(button(render(['Tenders.View']).element, 'Close tender early')).toBeUndefined();
    TestBed.resetTestingModule();
    expect(
      button(
        render(['Tenders.View', 'Tenders.CloseEarly'], { deadlineState: 'Closed' }).element,
        'Close tender early',
      ),
    ).toBeUndefined();
    TestBed.resetTestingModule();
    expect(
      button(render(['Tenders.View', 'Tenders.CloseEarly']).element, 'Close tender early'),
    ).toBeDefined();
  });

  it('states the deadline, the counts and a strong warning, and needs a reason and an explicit acknowledgement', () => {
    const { http, control, element } = render(['Tenders.View', 'Tenders.CloseEarly']);
    button(element, 'Close tender early')!.click();
    control.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(dialog)).toContain(
      '2 invited firms have not submitted. Closing this tender will prevent them from submitting.',
    );
    expect(text(dialog)).toContain('It is not a cancellation');
    expect(text(dialog)).toContain('does not accept, recommend or award any bidder');
    expect(text(dialog)).toContain('Current deadline');

    button(dialog, 'Close tender early')!.click();
    control.detectChanges();
    expect(text(dialog)).toContain('Explain the reason');
    const reason = dialog.querySelector('#tender-close-reason') as HTMLTextAreaElement;
    reason.value = 'Enough submissions received';
    reason.dispatchEvent(new Event('input'));
    control.detectChanges();
    button(dialog, 'Close tender early')!.click();
    control.detectChanges();
    expect(text(dialog)).toContain('Tick the box');
    http.expectNone('/api/v1/tenders/t1/close-early');

    const acknowledge = dialog.querySelector('input[type="checkbox"]') as HTMLInputElement;
    acknowledge.click();
    control.detectChanges();
    button(dialog, 'Close tender early')!.click();
    const request = http.expectOne('/api/v1/tenders/t1/close-early');
    expect(request.request.body).toMatchObject({
      reason: 'Enough submissions received',
      confirmed: true,
      notSubmittedCount: 2,
      version: 'v1',
    });
    expect(request.request.body.requestKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('asks again with fresh numbers when a firm submitted while the buyer was deciding', async () => {
    const { http, control, element } = render(['Tenders.View', 'Tenders.CloseEarly']);
    button(element, 'Close tender early')!.click();
    control.detectChanges();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    const reason = dialog.querySelector('#tender-close-reason') as HTMLTextAreaElement;
    reason.value = 'Enough submissions received';
    reason.dispatchEvent(new Event('input'));
    (dialog.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    control.detectChanges();
    button(dialog, 'Close tender early')!.click();
    http
      .expectOne('/api/v1/tenders/t1/close-early')
      .flush(
        { code: 'tender.close_counts_changed', parameters: { submitted: '2', notSubmitted: '1' } },
        { status: 409, statusText: 'Conflict' },
      );
    const refreshed = published({
      closureCounts: { invited: 3, submitted: 2, notSubmitted: 1 },
      version: 'v2',
    });
    http.expectOne('/api/v1/tenders/t1').flush(refreshed);
    control.componentRef.setInput('tender', refreshed);
    control.detectChanges();
    // ngModel writes the cleared acknowledgement to the checkbox once change detection settles.
    await control.whenStable();
    control.detectChanges();
    const again = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(text(again)).toContain('2 submitted and 1 not submitted now');
    expect(text(again)).toContain('1 invited firm has not submitted');
    expect((again.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
  });

  it('shows how and when a closed tender closed, and that closing is not an award', () => {
    const { element } = render(['Tenders.View'], {
      deadlineState: 'Closed',
      closure: {
        kind: 'Early',
        closedAt: { utc: '2026-10-03T09:00:00Z', local: '2026-10-03T12:00', offset: '+03:00' },
        scheduledDeadline: {
          utc: '2026-10-06T09:00:00Z',
          local: '2026-10-06T12:00',
          offset: '+03:00',
        },
        closedByName: 'Maha Manager',
        reason: 'Enough submissions',
        bidsOpenedAtUtc: null,
      },
    });
    expect(text(element)).toContain('This tender was closed early.');
    expect(text(element)).toContain('Maha Manager');
    expect(text(element)).toContain('Enough submissions');
    expect(text(element)).toContain('does not accept, recommend or award any bidder');
  });
});
