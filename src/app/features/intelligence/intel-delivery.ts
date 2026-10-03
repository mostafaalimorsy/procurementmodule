import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import {
  categoryLabel,
  outcomeTypeLabel,
  rehireShortLabel,
  scheduleOutcomeLabel,
  signedPercent,
  timingWarningLabel,
} from '../performance/performance-labels';
import {
  DeliveryIntelligence,
  EvidenceSummary,
  IntelligenceAccess,
  SampleSummary,
} from './intelligence.api';
import { central, centralAt, rate, roundDecimal, samplePrecision } from './intelligence-labels';
import { VarianceCause } from '../performance/variance-cause';

/**
 * Delivery evidence from finalized closeouts (Part 12, ADR-076): on-time, cost and schedule variance, quality and HSE on the company's
 * internal 1–5 scale, variation, claim and dispute patterns kept apart, would-work-again — each with its count, and every project behind
 * it. The outcome score, when shown at all, is a whole number with its rule and sample; cost evidence is present only for commercial
 * readers.
 */
@Component({
  selector: 'app-intel-delivery',
  imports: [RouterLink, BusinessDatePipe, VarianceCause],
  templateUrl: './intel-delivery.html',
  styleUrl: './intel-delivery.scss',
})
export class IntelDeliveryView {
  readonly delivery = input.required<DeliveryIntelligence>();
  readonly evidence = input.required<EvidenceSummary>();
  readonly access = input.required<IntelligenceAccess>();
  /** CF-026: the category in scope (null = all categories, where no composite is shown). */
  readonly categoryName = input<string | null>(null);
  readonly rate = rate;
  readonly central = central;
  readonly percent = signedPercent;
  readonly scheduleLabel = scheduleOutcomeLabel;
  readonly rehireLabel = rehireShortLabel;
  readonly categoryLabel = categoryLabel;
  readonly outcomeLabel = outcomeTypeLabel;
  readonly timingLabel = timingWarningLabel;

  /** CF-048: the outcome types other than Completed, with their counts (a default termination is named, never hidden in a median). */
  notCompleted(): readonly { readonly type: string; readonly count: number }[] {
    return Object.entries(this.delivery().outcomeTypes ?? {})
      .filter(([type]) => type !== 'Completed')
      .map(([type, count]) => ({ type, count }));
  }

  /** CF-125: a range at the precision of its sample (percentages signed; ratings as "3–4"). */
  range(summary: SampleSummary | null, kind: 'rating' | 'percent' = 'percent'): string {
    if (!summary || summary.count < 2 || !summary.minimum || !summary.maximum) return '';
    // Ratings are whole numbers: their extremes are too, whatever the sample size.
    const decimals = kind === 'rating' ? 0 : samplePrecision(summary.count, kind);
    const [low, high] = [
      roundDecimal(summary.minimum, decimals),
      roundDecimal(summary.maximum, decimals),
    ];
    return kind === 'rating' ? `${low}–${high}` : `${signedPercent(low)} … ${signedPercent(high)}`;
  }

  readonly centralAt = centralAt;

  distribution(counts: readonly number[]): string {
    return counts.map((count, index) => `${index + 1}: ${count}`).join(' · ');
  }
}
