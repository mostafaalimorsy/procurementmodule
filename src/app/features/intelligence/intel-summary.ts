import { Component, computed, input } from '@angular/core';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { categoryLabel } from '../performance/performance-labels';
import { SubcontractorIntelligence } from './intelligence.api';
import { rate, strengthLabel, windowShare } from './intelligence-labels';

/**
 * CF-014 (ADR-130): the profile's summary strip, above the fold — the scope shown, how much delivery evidence stands behind it, response
 * reliability with its denominator, the share of the bidding window used, and (for performance readers) the would-work-again pattern. It
 * repeats the figures of the intelligence section below, from the same read; nothing here is computed again.
 */
@Component({
  selector: 'app-intel-summary',
  imports: [BusinessDatePipe],
  styles: `
    :host {
      display: block;
      margin-block: 0.75rem;
    }
    .intel-summary p {
      margin: 0.25rem 0;
    }
  `,
  template: `
    <aside
      class="prj-note intel-summary"
      aria-labelledby="intel-summary-title"
      data-testid="intel-summary"
    >
      <p>
        <strong id="intel-summary-title">{{ scope() }}</strong>
        ·
        @if (profile().evidence.completedProjects === 0) {
          <span i18n="@@intelSummary.noCloseouts">no finalized closeout yet</span>
        } @else {
          <span i18n="@@intelSummary.closeouts">{profile().evidence.completedProjects, plural,
            =1 {1 finalized closeout}
            other {{{ profile().evidence.completedProjects }} finalized closeouts}
          }</span
          >&ngsp;<span>({{ strength(profile().evidence.strength) }})</span>
          @if (profile().evidence.latestClosedAtUtc; as latest) {
            <span i18n="@@intelSummary.latest">
              · latest <bdi>{{ latest | businessDate: 'instant' }}</bdi></span
            >
          }
        }
      </p>
      <p>
        @if (profile().procurement.valid > 0) {
          <span i18n="@@intelSummary.reliability"
            >Response reliability
            <bdi dir="ltr">{{ rate(profile().procurement.reliabilityPercent) }}</bdi> (<bdi
              dir="ltr"
              >{{ profile().procurement.submitted }}</bdi
            >
            of <bdi dir="ltr">{{ profile().procurement.valid }}</bdi> valid invitations)</span
          >
        } @else {
          <span i18n="@@intelSummary.noInvitation">No valid invitation yet</span>
        }
        @if (share(); as used) {
          <span i18n="@@intelSummary.windowShare">
            · bids after <bdi dir="ltr">{{ used }} %</bdi> of the bidding window</span
          >
        }
        @if (profile().delivery; as delivery) {
          @if (profile().evidence.completedProjects > 0) {
            <span i18n="@@intelSummary.rehire">
              · would work again yes <bdi dir="ltr">{{ delivery.wouldWorkAgainYes }}</bdi> ·
              conditional <bdi dir="ltr">{{ delivery.wouldWorkAgainConditional }}</bdi> · no
              <bdi dir="ltr">{{ delivery.wouldWorkAgainNo }}</bdi></span
            >
          }
        }
      </p>
      <p>
        <a href="#intel-title" i18n="@@intelSummary.details">The evidence behind these figures</a>
      </p>
    </aside>
  `,
})
export class IntelSummary {
  readonly profile = input.required<SubcontractorIntelligence>();
  readonly strength = strengthLabel;
  readonly rate = rate;
  readonly share = computed(() =>
    windowShare(this.profile().procurement.windowShareToFirstSubmission),
  );
  readonly scope = computed(() =>
    this.profile().categoryKey === null
      ? $localize`:@@intelSummary.allCategories:History in all categories`
      : $localize`:@@intelSummary.inCategory:History in ${categoryLabel(this.profile().category)}:category:`,
  );
}
