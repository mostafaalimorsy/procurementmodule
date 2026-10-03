import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  BusinessDatePipe,
  tenderLocalTime,
  zonedInstant,
} from '../../core/localization/business-format';
import {
  deadlineStateLabel,
  tenderLifecycleLabel,
  tenderStatusLabel,
  tenderTypeLabel,
} from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { Paged } from '../subcontractors/subcontractors.api';
import {
  TENDER_STAGES,
  TenderStage,
  TenderSummary,
  TenderingApi,
  tenderProblemMessage,
} from './tendering.api';

/**
 * Every tender of the company in one dense table, most recently changed first. Paged and filtered by
 * the server. A tender starts from an approved shortlist, so the list points there rather than
 * offering a form without one.
 */
@Component({
  selector: 'app-tender-list',
  imports: [FormsModule, RouterLink, BusinessDatePipe],
  templateUrl: './tender-list.html',
  styleUrl: './tendering.scss',
})
export class TenderList implements OnInit {
  private readonly api = inject(TenderingApi);
  private readonly route = inject(ActivatedRoute);
  private readonly locale = inject(LocaleService).locale;

  readonly statusLabel = tenderStatusLabel;
  readonly typeLabel = tenderTypeLabel;
  readonly deadlineLabel = deadlineStateLabel;
  /** CF-009: the list filters by where a tender is (the same rule as the dashboard figures), never by the stored "Published". */
  readonly stages = TENDER_STAGES;
  readonly stepLabel = tenderLifecycleLabel;
  readonly result = signal<Paged<TenderSummary> | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  stage: TenderStage | '' = '';

  /**
   * Red-team B-098-1 (CF-098): "15 Oct 2026, 14:00 (Asia/Riyadh, UTC+03:00)" — the server's tender-local time; an older summary without it
   * is converted from the UTC instant into the same zone and pattern.
   */
  deadline(item: TenderSummary): string {
    return item.submissionDeadline
      ? tenderLocalTime(item.submissionDeadline, item.timeZoneId, this.locale)
      : zonedInstant(item.submissionDeadlineUtc, item.timeZoneId, this.locale);
  }
  search = '';
  page = 1;

  ngOnInit(): void {
    // Part 12: a dashboard link may open the list already filtered.
    const params = this.route.snapshot?.queryParamMap;
    const stage = params?.get('stage') ?? null;
    if (this.stages.includes(stage as TenderStage)) this.stage = stage as TenderStage;
    // Older links filtered by stored status: Draft and Cancelled are stages too; "Published" spans several stages, so it shows all.
    const status = params?.get('status') ?? null;
    if (!this.stage && (status === 'Draft' || status === 'Cancelled')) this.stage = status;
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
    this.api
      .list({ stage: this.stage ? [this.stage] : [], search: this.search, page: this.page })
      .subscribe({
        next: (page) => {
          this.result.set(page);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(tenderProblemMessage(error));
          this.loading.set(false);
        },
      });
  }
}
