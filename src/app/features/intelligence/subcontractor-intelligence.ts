import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { money } from '../evaluation/evaluation-format';
import {
  categoryLabel,
  outcomeTypeLabel,
  retrospectiveBadge,
  signedPercent,
} from '../performance/performance-labels';
import { EvidenceStrengthBadge } from './evidence-strength';
import { IntelDeliveryView } from './intel-delivery';
import { IntelSimilarView } from './intel-similar';
import {
  CategoryScope,
  IntelligenceApi,
  SubcontractorIntelligence,
  intelligenceProblemMessage,
} from './intelligence.api';
import {
  central,
  centralAt,
  dispositionLabel,
  duration,
  windowShare,
  outcomeLabel,
  rate,
} from './intelligence-labels';

/**
 * The subcontractor intelligence profile (Part 12): the firm's private procurement and delivery evidence, all categories together or
 * one category at a time — history is never carried across categories. Every figure travels with its evidence count and period, and
 * sections the reader may not see are absent from the server's answer (commercial, delivery, decisions).
 */
@Component({
  selector: 'app-subcontractor-intelligence',
  imports: [
    FormsModule,
    RouterLink,
    BusinessDatePipe,
    EvidenceStrengthBadge,
    IntelDeliveryView,
    IntelSimilarView,
  ],
  templateUrl: './subcontractor-intelligence.html',
  styleUrl: './subcontractor-intelligence.scss',
})
export class SubcontractorIntelligenceView implements OnInit, OnDestroy {
  private readonly api = inject(IntelligenceApi);
  readonly locale = inject(LocaleService).locale;
  readonly subcontractorId = input.required<string>();
  /** The next project's work package, when the profile was opened from its sourcing (similar-project evidence). */
  readonly workPackageId = input<string | null>(null);
  /** CF-026: the category a work package or a decision opened the profile in (its key or text). */
  readonly initialCategory = input<string | null>(null);
  /** CF-014: each loaded profile, for the summary strip at the top of the page (no second read). */
  readonly loaded = output<SubcontractorIntelligence>();
  /** Whether the reader chose the scope (no default may override it). */
  private chosen = false;
  readonly profile = signal<SubcontractorIntelligence | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  /** '*' = all categories; otherwise a category key ('' = work packages without a category). */
  scope = '*';
  readonly rate = rate;
  readonly duration = duration;
  readonly windowShare = windowShare;
  readonly central = central;
  readonly centralAt = centralAt;
  readonly outcomeLabel = outcomeLabel;
  readonly outcomeTypeLabel = outcomeTypeLabel;
  readonly retrospectiveBadge = retrospectiveBadge();
  readonly dispositionLabel = dispositionLabel;
  readonly categoryLabel = categoryLabel;
  readonly percent = signedPercent;
  private request?: Subscription;
  /** Announced once a scope has loaded (the visible line is re-created on every load, so it cannot be the live region). */
  readonly announcement = computed(() =>
    this.loading() || !this.profile()
      ? ''
      : $localize`:@@intel.showingAnnouncement:Showing ${this.scopeLabel()}:scope:`,
  );
  readonly scopeLabel = computed(() => {
    const view = this.profile();
    if (!view || view.categoryKey === null) return $localize`:@@intel.allCategories:All categories`;
    return categoryLabel(view.category);
  });

  ngOnInit(): void {
    // CF-026: the category the reader came from; otherwise the one with the most finalized closeouts (chosen after the first read).
    const initial = this.initialCategory();
    if (initial) {
      this.scope = initial;
      this.chosen = true;
    }
    this.load();
  }

  choose(): void {
    this.chosen = true;
    this.load();
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }

  load(): void {
    // A later scope always wins: the earlier request is cancelled rather than allowed to overwrite it.
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    const scope: CategoryScope =
      this.scope === '*' ? { kind: 'all' } : { kind: 'key', key: this.scope };
    this.request = this.api
      .subcontractor(this.subcontractorId(), scope, this.workPackageId())
      .subscribe({
        next: (profile) => {
          this.profile.set(profile);
          this.loading.set(false);
          this.loaded.emit(profile);
          // A category named by its text (from a decision or a candidate card) is shown under the key the server resolved it to.
          if (profile.categoryKey !== null) this.scope = profile.categoryKey;
          if (!this.chosen && this.scope === '*') {
            this.chosen = true;
            const busiest = [...profile.categories]
              .filter((option) => option.completedProjects > 0)
              .sort((a, b) => b.completedProjects - a.completedProjects)[0];
            if (busiest) {
              this.scope = busiest.key;
              this.load();
            }
          }
        },
        error: (error: unknown) => {
          this.error.set(intelligenceProblemMessage(error));
          this.loading.set(false);
        },
      });
  }

  money(amount: string): string {
    return money(amount, this.locale);
  }
}
