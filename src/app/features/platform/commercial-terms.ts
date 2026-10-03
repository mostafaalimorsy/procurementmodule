import { Component, computed, input } from '@angular/core';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { CommercialMode, Company } from './platform-api.service';

/** CF-127 / OD-15 (ADR-138): how each commercial mode reads. */
export function commercialModeLabel(mode: CommercialMode): string {
  switch (mode) {
    case 'Pilot':
      return $localize`:@@commercial.pilot:Pilot`;
    case 'PaidPilot':
      return $localize`:@@commercial.paidPilot:Paid pilot`;
    case 'Subscribed':
      return $localize`:@@commercial.subscribed:Subscription`;
  }
}

/** Whole days from today (UTC) to a date ("2026-10-31"); negative once it has passed. */
export function daysUntil(date: string, today = new Date()): number {
  const target = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((target - start) / 86_400_000);
}

/** The operator's reminder for a dated term: past its end, within a week, within 30 days, or nothing yet. */
export function endWarning(
  company: Company,
  today = new Date(),
): { kind: 'ended' | 'week' | 'month'; days: number } | null {
  if (!company.commercialEndsOn || company.accessState === 'Purged') return null;
  const days = daysUntil(company.commercialEndsOn, today);
  if (days < 0) return { kind: 'ended', days: -days };
  if (days <= 7) return { kind: 'week', days };
  if (days <= 30) return { kind: 'month', days };
  return null;
}

/** CF-127: the company's commercial mode and the reminder its end date calls for (T−30, T−7, past). */
@Component({
  selector: 'app-commercial-chip',
  imports: [BusinessDatePipe],
  styleUrl: './platform.scss',
  template: `
    @if (company().commercialMode; as mode) {
      <span>{{ label(mode) }}</span>
      @if (company().commercialEndsOn; as end) {
        ·
        <span i18n="@@commercial.until"
          >until <bdi>{{ end | businessDate: 'date' }}</bdi></span
        >
      }
      @if (warning(); as reminder) {
        ·
        @switch (reminder.kind) {
          @case ('ended') {
            <span
              class="state-chip state-chip--suspended"
              data-testid="commercial-ended"
              i18n="@@commercial.ended"
              >Ended
              {reminder.days, plural, =1 {1 day ago} other {{{ reminder.days }} days ago}}</span
            >
          }
          @default {
            <span
              class="state-chip"
              [class.state-chip--suspended]="reminder.kind === 'week'"
              data-testid="commercial-ending"
              i18n="@@commercial.ending"
              >Ends in
              {reminder.days, plural,
                =0 {less than a day}
                =1 {1 day}
                other {{{ reminder.days }} days}
              }</span
            >
          }
        }
      }
    } @else {
      <span class="muted" i18n="@@commercial.notRecorded">Not recorded</span>
    }
  `,
})
export class CommercialChip {
  readonly company = input.required<Company>();
  protected readonly label = commercialModeLabel;
  protected readonly warning = computed(() => endWarning(this.company()));
}
