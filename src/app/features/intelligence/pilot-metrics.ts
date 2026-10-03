import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessDatePipe, monthLabel } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import {
  IntelligenceApi,
  PilotDuration,
  PilotMetrics,
  PilotPeriod,
  intelligenceProblemMessage,
} from './intelligence.api';

/** The first day of a month input's month ("2026-07" → "2026-07-01"), or of the month after it. */
const monthStart = (month: string, after = 0): string => {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + after, 1));
  return date.toISOString().slice(0, 10);
};

interface Row {
  readonly label: string;
  readonly definition: string;
  readonly cell: (period: PilotPeriod) => string;
}

/**
 * CF-080 (ADR-131): the pilot metrics — read-only figures computed from the instants the product already records, per calendar month and
 * for the whole period, to compare with the baseline agreed before the pilot. No money, price, score or firm name appears here.
 */
@Component({
  selector: 'app-pilot-metrics',
  imports: [FormsModule, BusinessDatePipe],
  template: `
    <section class="prj-page" aria-labelledby="pilot-title">
      <header class="prj-page-head">
        <div>
          <h1 id="pilot-title" i18n="@@pilot.title">Pilot metrics</h1>
          <p class="prj-hint" i18n="@@pilot.intro">
            Read-only figures from the dates the product records, to compare with the baseline
            agreed before the pilot. Each figure counts in the month its event was completed. No
            money, price, score or firm name appears here.
          </p>
        </div>
      </header>
      <form class="prj-filters" (ngSubmit)="load()">
        <div class="prj-field">
          <label for="pilot-from" i18n="@@pilot.fromMonth">From (month)</label>
          <input id="pilot-from" name="from" type="month" [(ngModel)]="fromMonth" />
        </div>
        <div class="prj-field">
          <label for="pilot-to" i18n="@@pilot.toMonth">To (month, included)</label>
          <input id="pilot-to" name="to" type="month" [(ngModel)]="toMonth" />
        </div>
        <button class="prj-btn prj-btn--ghost" type="submit" i18n="@@pilot.show">Show</button>
      </form>
      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
      } @else if (metrics(); as view) {
        @if (view.truncated) {
          <p class="prj-note" role="note" i18n="@@pilot.truncated">
            This period has more records than one read covers: choose a shorter period.
          </p>
        }
        <div class="prj-table-wrap">
          <table class="prj-table" data-testid="pilot-table">
            <caption class="prj-visually-hidden" i18n="@@pilot.caption">
              Pilot metrics by month
            </caption>
            <thead>
              <tr>
                <th scope="col" i18n="@@pilot.measure">Measure</th>
                @for (month of view.months; track month.from) {
                  <th scope="col">{{ monthLabel(month.from) }}</th>
                }
                <th scope="col" i18n="@@pilot.wholePeriod">Whole period</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows; track row.label) {
                <tr>
                  <th scope="row">{{ row.label }}</th>
                  @for (month of view.months; track month.from) {
                    <td>
                      <bdi>{{ row.cell(month) }}</bdi>
                    </td>
                  }
                  <td>
                    <strong
                      ><bdi>{{ row.cell(view.total) }}</bdi></strong
                    >
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p>
          <a [href]="exportUrl()" download i18n="@@pilot.export">Download as CSV</a>
          ·
          <span class="prj-hint" i18n="@@pilot.generated"
            >Computed <bdi>{{ view.generatedAtUtc | businessDate: 'instant' }}</bdi> · rule
            <bdi dir="ltr" class="ltr-token">{{ view.rule }}</bdi></span
          >
        </p>
        <details>
          <summary i18n="@@pilot.definitions">How each figure is computed</summary>
          <dl>
            @for (row of rows; track row.label) {
              <dt>{{ row.label }}</dt>
              <dd>{{ row.definition }}</dd>
            }
          </dl>
        </details>
      } @else {
        <p class="prj-hint" i18n="@@pilot.loading">Computing the pilot metrics…</p>
      }
    </section>
  `,
})
export class PilotMetricsPage implements OnInit {
  private readonly api = inject(IntelligenceApi);
  private readonly locale = inject(LocaleService).locale;
  readonly metrics = signal<PilotMetrics | null>(null);
  readonly error = signal('');
  fromMonth = '';
  toMonth = '';

  readonly rows: readonly Row[] = [
    {
      label: $localize`:@@pilot.cycle:Tender cycle, publication to award (days)`,
      definition: $localize`:@@pilot.cycleDefinition:Tenders first awarded in the month: days from publication to the award. Median and 90th percentile.`,
      cell: (period) => this.duration(period.tenderCycleDays),
    },
    {
      label: $localize`:@@pilot.response:Invitation response rate`,
      definition: $localize`:@@pilot.responseDefinition:Invitations issued in the month whose bidding has closed (as response reliability counts them): those the firm answered — a bid, a decline or a withdrawal.`,
      cell: (period) =>
        this.rate(
          period.invitations.responseRatePercent,
          period.invitations.replied,
          period.invitations.valid,
        ),
    },
    {
      label: $localize`:@@pilot.submission:Bid submission rate`,
      definition: $localize`:@@pilot.submissionDefinition:The same invitations: those answered with a submitted bid.`,
      cell: (period) =>
        this.rate(
          period.invitations.submissionRatePercent,
          period.invitations.submitted,
          period.invitations.valid,
        ),
    },
    {
      label: $localize`:@@pilot.leveling:Opening to leveling complete (days)`,
      definition: $localize`:@@pilot.levelingDefinition:Commercial leveling completed in the month: days from the bid opening.`,
      cell: (period) => this.duration(period.openingToLevelingDays),
    },
    {
      label: $localize`:@@pilot.approval:Decision submitted to approved (days)`,
      definition: $localize`:@@pilot.approvalDefinition:Decision versions whose last required approval was recorded in the month: days from submission.`,
      cell: (period) => this.duration(period.decisionApprovalDays),
    },
    {
      label: $localize`:@@pilot.history:Recommendations with history applied`,
      definition: $localize`:@@pilot.historyDefinition:Recommendations computed in the month whose ranking applied past performance, of all computed.`,
      cell: (period) =>
        this.rate(
          period.recommendations.appliedPercent,
          period.recommendations.historyApplied,
          period.recommendations.computed,
        ),
    },
    {
      label: $localize`:@@pilot.closeout30:Closeouts finalized within 30 days of award`,
      definition: $localize`:@@pilot.closeoutDefinition:Awards made in the month, counted once 30 (or 60) days have passed: those whose closeout was first finalized within that time.`,
      cell: (period) =>
        this.rate(
          period.closeouts.within30Percent,
          period.closeouts.within30,
          period.closeouts.due30,
          true,
        ),
    },
    {
      label: $localize`:@@pilot.closeout60:Closeouts finalized within 60 days of award`,
      definition: $localize`:@@pilot.closeout60Definition:As above, at 60 days.`,
      cell: (period) =>
        this.rate(
          period.closeouts.within60Percent,
          period.closeouts.within60,
          period.closeouts.due60,
          true,
        ),
    },
  ];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.error.set('');
    const [from, to] = this.range();
    this.api.pilotMetrics(from, to).subscribe({
      next: (metrics) => {
        this.metrics.set(metrics);
        if (!this.fromMonth) this.fromMonth = metrics.from.slice(0, 7);
        if (!this.toMonth) this.toMonth = monthStart(metrics.to.slice(0, 7), -1).slice(0, 7);
      },
      error: (error: unknown) => this.error.set(intelligenceProblemMessage(error)),
    });
  }

  exportUrl(): string {
    const [from, to] = this.range();
    return this.api.pilotMetricsExportUrl(from, to);
  }

  monthLabel(date: string): string {
    return monthLabel(date, this.locale);
  }

  /** "4.5 d · p90 9.0 d (n = 6)"; one observation is its own value; none is a dash, never zero. */
  duration(value: PilotDuration): string {
    if (value.count === 0) return '—';
    if (value.count === 1) return $localize`:@@pilot.durationOne:${value.minimum}:value: d (one)`;
    return $localize`:@@pilot.durationMany:${value.median}:median: d · p90 ${value.p90}:p90: d (n = ${value.count}:count:)`;
  }

  /** "66.7 % (2 of 3)"; nothing to divide by is a dash — or "not yet due" for closeouts. */
  rate(percent: string | null, part: number, whole: number, due = false): string {
    if (whole === 0) return due ? $localize`:@@pilot.notYetDue:not yet due` : '—';
    return $localize`:@@pilot.rate:${percent}:percent: % (${part}:part: of ${whole}:whole:)`;
  }

  private range(): [string | undefined, string | undefined] {
    return [
      this.fromMonth ? monthStart(this.fromMonth) : undefined,
      this.toMonth ? monthStart(this.toMonth, 1) : undefined,
    ];
  }
}
