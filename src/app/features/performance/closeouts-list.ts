import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { CloseoutTabs } from './closeout-tabs';
import { LocaleService } from '../../core/localization/locale.service';
import { money } from '../evaluation/evaluation-format';
import {
  CloseoutLifecycle,
  CloseoutPage,
  LIFECYCLES,
  PerformanceApi,
  performanceProblemMessage,
} from './performance.api';
import { categoryLabel, lifecycleLabel } from './performance-labels';

/**
 * Every award of the company with its closeout state (Part 11): pending closeouts first to find, then those in progress,
 * reopened for correction and closed. Cards rather than a wide table, so it reads the same on a phone and a desk.
 */
@Component({
  selector: 'app-closeouts-list',
  imports: [FormsModule, RouterLink, BusinessDatePipe, CloseoutTabs],
  templateUrl: './closeouts-list.html',
  styleUrl: './closeouts-list.scss',
})
export class CloseoutsList implements OnInit {
  private readonly api = inject(PerformanceApi);
  private readonly route = inject(ActivatedRoute);
  readonly locale = inject(LocaleService).locale;
  readonly lifecycleLabel = lifecycleLabel;
  readonly categoryLabel = categoryLabel;
  readonly lifecycles = LIFECYCLES;
  readonly result = signal<CloseoutPage | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  status: CloseoutLifecycle | '' = '';
  search = '';
  page = 1;

  ngOnInit(): void {
    // Part 12: a dashboard link may open the list already filtered.
    const status = this.route.snapshot?.queryParamMap?.get('status') ?? null;
    if (this.lifecycles.includes(status as CloseoutLifecycle))
      this.status = status as CloseoutLifecycle;
    this.load();
  }

  applyFilter(): void {
    this.page = 1;
    this.load();
  }

  goToPage(page: number): void {
    this.page = page;
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list({ status: this.status, search: this.search, page: this.page }).subscribe({
      next: (page) => {
        this.result.set(page);
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
}
