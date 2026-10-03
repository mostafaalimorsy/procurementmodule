import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { money } from '../evaluation/evaluation-format';
import {
  PerformanceApi,
  SubcontractorPerformance,
  performanceProblemMessage,
} from './performance.api';
import {
  categoryLabel,
  mobilizationLabel,
  rehireShortLabel,
  scheduleOutcomeLabel,
  signedPercent,
  outcomeTypeLabel,
  timingWarningLabel,
} from './performance-labels';
import { VarianceCause } from './variance-cause';

/**
 * A firm's private project-performance history (Part 11) on its directory profile: only finalized closeouts, grouped by
 * category, each group led by its sample size and recency. The evidence is shown as evidence — means, ranges and counts
 * with every completed project behind them — never as one precise-looking supplier grade.
 */
@Component({
  selector: 'app-subcontractor-performance',
  imports: [RouterLink, BusinessDatePipe, VarianceCause],
  templateUrl: './subcontractor-performance.html',
  styleUrl: './subcontractor-performance.scss',
})
export class SubcontractorPerformanceView implements OnInit {
  private readonly api = inject(PerformanceApi);
  readonly locale = inject(LocaleService).locale;
  readonly subcontractorId = input.required<string>();
  readonly history = signal<SubcontractorPerformance | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly categoryLabel = categoryLabel;
  readonly percent = signedPercent;
  readonly rehireLabel = rehireShortLabel;
  readonly scheduleLabel = scheduleOutcomeLabel;
  readonly mobilizationLabel = mobilizationLabel;
  readonly outcomeLabel = outcomeTypeLabel;
  readonly timingLabel = timingWarningLabel;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.subcontractor(this.subcontractorId()).subscribe({
      next: (history) => {
        this.history.set(history);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(performanceProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  money(amount: string | null): string {
    return money(amount, this.locale);
  }

  range(min: string | null, max: string | null): string {
    if (!min || !max) return '—';
    return min === max ? signedPercent(min) : `${signedPercent(min)} … ${signedPercent(max)}`;
  }
}
