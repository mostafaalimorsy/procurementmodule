import { Component, computed, input } from '@angular/core';
import { CompanyInFlight } from './platform-api.service';

/** CF-061 (ADR-133): the label of an in-flight count, as the operator reads it before freezing the work. */
export function inFlightLabel(key: string): string {
  switch (key) {
    case 'open_tenders':
      return $localize`:@@inFlight.openTenders:Open tenders with invited firms`;
    case 'open_rounds':
      return $localize`:@@inFlight.openRounds:Open negotiation rounds`;
    case 'decisions_pending_approval':
      return $localize`:@@inFlight.pendingApproval:Decisions waiting for approval`;
    case 'decisions_approved_not_awarded':
      return $localize`:@@inFlight.approvedNotAwarded:Approved decisions not yet awarded`;
    case 'closeouts_in_progress':
      return $localize`:@@inFlight.closeouts:Closeouts being recorded`;
    default:
      return key;
  }
}

/**
 * CF-061 (ADR-133): the company's work in progress that a change would freeze — server-computed counts only (never records). With
 * <c>keys</c>, only those counts (the ones a removed feature freezes).
 */
@Component({
  selector: 'app-in-flight-counts',
  template: `
    @if (!counts()) {
      <p class="muted" i18n="@@inFlight.loading">Counting the work in progress…</p>
    } @else if (shown().length === 0) {
      <p data-testid="in-flight-none" i18n="@@inFlight.none">
        Nothing in progress would be frozen.
      </p>
    } @else {
      <p i18n="@@inFlight.heading">This freezes work in progress:</p>
      <ul data-testid="in-flight-counts">
        @for (item of shown(); track item.key) {
          <li>
            {{ label(item.key) }}: <strong dir="ltr">{{ item.count }}</strong>
          </li>
        }
      </ul>
    }
  `,
})
export class InFlightCounts {
  readonly counts = input<CompanyInFlight | null>(null);
  readonly keys = input<readonly string[] | null>(null);
  readonly label = inFlightLabel;
  readonly shown = computed(() => {
    const counts = this.counts()?.counts ?? {};
    const keys = this.keys();
    return Object.entries(counts)
      .filter(([key, count]) => count > 0 && (!keys || keys.includes(key)))
      .map(([key, count]) => ({ key, count }));
  });
}
