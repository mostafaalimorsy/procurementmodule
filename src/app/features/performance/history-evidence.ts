import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { HistoricalEvidence } from '../decision/decision.api';
import { PERFORMANCE_FEATURES, PERFORMANCE_PERMISSIONS } from './performance.api';
import { categoryLabel, rehireShortLabel, signedPercent } from './performance-labels';
import { VarianceCause } from './variance-cause';

/**
 * Part 11 inside a recommendation: the historical performance evidence a candidate had when the recommendation was computed —
 * kept apart from the current bid, and always with its sample size, category and recency next to the score the engine used.
 */
@Component({
  selector: 'app-history-evidence',
  imports: [RouterLink, BusinessDatePipe, VarianceCause],
  styles: `
    .pf-evidence {
      margin-block: 0.75rem;
      padding: 0.6rem 0.85rem;
      border-inline-start: 3px solid var(--color-border);
    }
    .pf-evidence h4 {
      margin: 0 0 0.25rem;
      font-size: 0.9rem;
    }
    .pf-evidence p {
      margin: 0 0 0.35rem;
    }
    .dc-list {
      margin: 0;
      padding-inline-start: 1.1rem;
    }
  `,
  template: `
    <div class="pf-evidence">
      <h4 i18n="@@evidence.title">Historical performance evidence (completed projects)</h4>
      @if (history(); as item) {
        <p>
          <!-- CF-023 (ADR-127): the number is a composite of the components listed below, never a grade on its own. -->
          @if (applied()) {
            <span i18n="@@evidence.composite"
              >Composite (rule <bdi dir="ltr">{{ ruleName(item.scoreRule) }}</bdi
              >) — the input this recommendation weighed:
              <bdi dir="ltr">{{ item.score }} / 100</bdi> · {{ categoryLabel(item.category) }}</span
            >
          } @else {
            <span i18n="@@evidence.compositeNotUsed"
              >Composite (rule <bdi dir="ltr">{{ ruleName(item.scoreRule) }}</bdi
              >): <bdi dir="ltr">{{ item.score }} / 100</bdi> — not used in this ranking ·
              {{ categoryLabel(item.category) }}</span
            >
          }
          ·
          <strong
            ><span i18n="@@evidence.sample">{item.sampleSize, plural,
              =1 {1 completed project}
              other {{{item.sampleSize}} completed projects}
            }</span></strong
          >
          ·
          <span i18n="@@evidence.latest"
            >latest closeout
            <bdi>{{ item.latestOutcomeAtUtc | businessDate: 'instant' }}</bdi></span
          >
        </p>
        <ul class="dc-list">
          @for (outcome of item.outcomes; track outcome.awardId) {
            <li>
              @if (canOpen()) {
                <a [routerLink]="['/closeouts', outcome.awardId]"
                  ><bdi dir="ltr">{{ outcome.tenderReference }}</bdi></a
                >
              } @else {
                <bdi dir="ltr">{{ outcome.tenderReference }}</bdi>
              }
              —
              <span i18n="@@evidence.outcome"
                >cost <bdi dir="ltr">{{ percent(outcome.costVariancePercent) }}</bdi
                >, duration <bdi dir="ltr">{{ percent(outcome.scheduleVariancePercent) }}</bdi
                >, quality <bdi dir="ltr">{{ outcome.qualityRating }}/5</bdi>, HSE
                <bdi dir="ltr">{{ outcome.hseRating }}/5</bdi></span
              >
              <app-variance-cause
                [cause]="outcome.variationCause"
                [share]="outcome.variationSharePercent"
                [residual]="outcome.residualCostVariancePercent"
              />
              · {{ rehireLabel(outcome.wouldWorkAgain) }}
            </li>
          }
        </ul>
        @if (subcontractorId() && canProfile()) {
          <p>
            <a
              [routerLink]="['/subcontractors', subcontractorId()]"
              [queryParams]="{ category: item.category }"
              i18n="@@evidence.profile"
              >Open the firm's intelligence in this category</a
            >
          </p>
        }
      } @else {
        <p class="prj-hint" i18n="@@evidence.none">
          No finalized closeout of this firm in this category — no history is invented.
        </p>
      }
    </div>
  `,
})
export class HistoryEvidence {
  /** "performance-outcome-v3" → "v3": the rule version, as the policy screens name it. */
  ruleName(rule: string | null | undefined): string {
    return rule?.replace('performance-outcome-', '') ?? 'v1';
  }

  private readonly session = inject(SessionService);
  private readonly entitlements = inject(EntitlementsService);
  readonly history = input<HistoricalEvidence | null | undefined>(null);
  /** Whether the recommendation actually applied the history weight (every eligible firm had history). */
  readonly applied = input(false);
  /** Links to closeouts only for people who can open them. */
  readonly canOpen = computed(
    () =>
      this.session.hasPermission(PERFORMANCE_PERMISSIONS.view) &&
      PERFORMANCE_FEATURES.every((feature) => this.entitlements.has(feature)),
  );
  /** CF-026: the firm the evidence is about, to open its profile in this category. */
  readonly subcontractorId = input<string | null | undefined>(null);
  /** The profile is offered to intelligence readers only (the literal keys avoid a circular import with the intelligence feature). */
  readonly canProfile = computed(
    () =>
      this.session.hasPermission('Intelligence.View') &&
      ['intelligence', ...PERFORMANCE_FEATURES].every((feature) => this.entitlements.has(feature)),
  );
  readonly categoryLabel = categoryLabel;
  readonly percent = signedPercent;
  readonly rehireLabel = rehireShortLabel;
}
