import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PilotDuration, PilotPeriod } from './intelligence.api';
import { PilotMetricsPage } from './pilot-metrics';

// CF-080 (ADR-131): the read-only pilot metrics — per month and for the whole period, never a zero for "nothing to count".

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ');
const none: PilotDuration = { count: 0, median: null, p90: null, minimum: null, maximum: null };

function period(from: string, to: string, overrides: Partial<PilotPeriod> = {}): PilotPeriod {
  return {
    from,
    to,
    tenderCycleDays: { count: 4, median: '12.5', p90: '20.0', minimum: '6.0', maximum: '20.0' },
    invitations: {
      issued: 4,
      valid: 3,
      replied: 3,
      submitted: 2,
      responseRatePercent: '100.0',
      submissionRatePercent: '66.7',
    },
    openingToLevelingDays: { count: 1, median: null, p90: null, minimum: '2.0', maximum: '2.0' },
    decisionApprovalDays: none,
    recommendations: { computed: 2, weighingHistory: 1, historyApplied: 1, appliedPercent: '50.0' },
    closeouts: {
      awards: 1,
      due30: 0,
      within30: 0,
      within30Percent: null,
      due60: 0,
      within60: 0,
      within60Percent: null,
    },
    ...overrides,
  };
}

describe('Pilot metrics', () => {
  it('shows each measure per month and for the period, with its sample and no invented zero', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const http = TestBed.inject(HttpTestingController);
    const page = TestBed.createComponent(PilotMetricsPage);
    page.detectChanges();
    const request = http.expectOne((r) => r.url === '/api/v1/intelligence/pilot-metrics');
    expect(request.request.params.keys()).toEqual([]);
    request.flush({
      from: '2026-09-01',
      to: '2026-11-01',
      generatedAtUtc: '2026-10-02T10:00:00Z',
      rule: 'pilot-metrics-v1',
      total: period('2026-09-01', '2026-11-01'),
      months: [period('2026-09-01', '2026-10-01'), period('2026-10-01', '2026-11-01')],
      truncated: false,
    });
    page.detectChanges();
    const element = page.nativeElement as HTMLElement;
    const table = element.querySelector('[data-testid="pilot-table"]')!;
    expect(table.querySelectorAll('thead th').length).toBe(4);
    const shown = text(table);
    expect(shown).toContain('Sep 2026');
    expect(shown).toContain('Whole period');
    expect(shown).toContain('12.5 d · p90 20.0 d (n = 4)');
    expect(shown).toContain('2.0 d (one)');
    expect(shown).toContain('100.0 % (3 of 3)');
    expect(shown).toContain('66.7 % (2 of 3)');
    expect(shown).toContain('50.0 % (1 of 2)');
    expect(shown).toContain('not yet due');
    expect(shown).toContain('—');
    expect(shown).not.toMatch(/\b0\.0 d\b/);
    // The chosen months travel to the server and the CSV, the last month included.
    const component = page.componentInstance;
    expect([component.fromMonth, component.toMonth]).toEqual(['2026-09', '2026-10']);
    component.fromMonth = '2026-07';
    component.toMonth = '2026-08';
    component.load();
    const chosen = http.expectOne((r) => r.url === '/api/v1/intelligence/pilot-metrics');
    expect([chosen.request.params.get('from'), chosen.request.params.get('to')]).toEqual([
      '2026-07-01',
      '2026-09-01',
    ]);
    expect(component.exportUrl()).toBe(
      '/api/v1/intelligence/pilot-metrics/export?from=2026-07-01&to=2026-09-01',
    );
    http.verify();
  });
});
