import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { CloseoutTabs } from './closeout-tabs';
import { PERFORMANCE_PERMISSIONS, performanceProblemMessage } from './performance.api';
import { retrospectiveBadge, retrospectiveStatusLabel } from './performance-labels';
import {
  RETROSPECTIVE_STATUSES,
  RetrospectiveApi,
  RetrospectivePage,
  RetrospectiveStatus,
} from './retrospective.api';

/**
 * CF-002 (ADR-126): the company's retrospective outcomes — past work recorded from documents so history exists before the first closeout.
 * Every row carries the "retrospective — not system-evidenced" label; drafts wait for confirmation by procurement leadership.
 */
@Component({
  selector: 'app-retrospective-list',
  imports: [FormsModule, RouterLink, BusinessDatePipe, CloseoutTabs],
  template: `
    <section class="prj-page" aria-labelledby="retro-title">
      <app-closeout-tabs current="retrospective" />
      <header class="prj-page-head">
        <div>
          <h1 id="retro-title" i18n="@@retrospective.title">Past outcomes</h1>
          <p class="prj-hint" i18n="@@retrospective.intro">
            Outcomes of work finished before this product, recorded from final accounts and
            completion documents. They are shown labelled and counted apart from closeouts, and no
            recommendation weighs them.
          </p>
        </div>
        <div class="prj-actions">
          @if (canRecord()) {
            <a class="prj-btn" routerLink="/retrospective-outcomes/new" i18n="@@retrospective.new"
              >Record a past outcome</a
            >
          }
          @if (canImport()) {
            <a
              class="prj-btn prj-btn--ghost"
              routerLink="/retrospective-outcomes/import"
              i18n="@@retrospective.import"
              >Import from a file</a
            >
          }
        </div>
      </header>
      <form class="prj-filters" (ngSubmit)="applyFilter()">
        <div class="prj-field">
          <label for="retro-status" i18n="@@retrospective.filterStatus">Status</label>
          <select
            id="retro-status"
            name="status"
            [(ngModel)]="status"
            (ngModelChange)="applyFilter()"
          >
            <option value="" i18n="@@retrospective.allStatuses">All</option>
            @for (option of statuses; track option) {
              <option [value]="option">{{ statusLabel(option) }}</option>
            }
          </select>
        </div>
        <div class="prj-field">
          <label for="retro-search" i18n="@@retrospective.search">Firm, project or package</label>
          <input id="retro-search" name="search" type="search" [(ngModel)]="search" />
        </div>
        <button class="prj-btn prj-btn--ghost" type="submit" i18n="@@retrospective.searchButton">
          Search
        </button>
      </form>
      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
      } @else if (result(); as page) {
        @if (page.items.length === 0) {
          <p class="prj-hint" i18n="@@retrospective.empty">No past outcome is recorded yet.</p>
        } @else {
          <ul class="prj-cards" role="list">
            @for (item of page.items; track item.id) {
              <li class="prj-card">
                <h2>
                  <a [routerLink]="['/retrospective-outcomes', item.id]"
                    ><bdi dir="ltr" class="tnd-code">{{ item.subcontractorCode }}</bdi>
                    <bdi>{{ item.subcontractorName }}</bdi></a
                  >
                </h2>
                <p>
                  <span class="prj-chip dc-state dc-state--muted">{{ badge }}</span>
                  <span class="prj-chip">{{ statusLabel(item.status) }}</span>
                  @if (item.imported) {
                    <span class="prj-chip" i18n="@@retrospective.imported">Imported</span>
                  }
                </p>
                <p class="prj-hint">
                  <bdi>{{ item.projectLabel }}</bdi> · <bdi>{{ item.packageLabel }}</bdi> ·
                  <bdi>{{ item.category }}</bdi>
                </p>
                <p class="prj-hint">
                  <span i18n="@@retrospective.recorded"
                    ><bdi dir="ltr">{{ item.recorded }} / {{ item.required }}</bdi> required items
                    recorded</span
                  >
                  · <bdi>{{ item.updatedAtUtc | businessDate: 'instant' }}</bdi>
                </p>
              </li>
            }
          </ul>
          @if (page.totalCount > page.items.length) {
            <nav class="prj-pager" aria-label="Pages" i18n-aria-label="@@retrospective.pages">
              <button
                class="prj-btn prj-btn--ghost"
                type="button"
                [disabled]="page.page <= 1"
                (click)="goToPage(page.page - 1)"
                i18n="@@retrospective.previous"
              >
                Previous
              </button>
              <button
                class="prj-btn prj-btn--ghost"
                type="button"
                [disabled]="page.page * page.pageSize >= page.totalCount"
                (click)="goToPage(page.page + 1)"
                i18n="@@retrospective.next"
              >
                Next
              </button>
            </nav>
          }
        }
      } @else {
        <p class="prj-hint" i18n="@@retrospective.loading">Loading past outcomes…</p>
      }
    </section>
  `,
})
export class RetrospectiveList implements OnInit {
  private readonly api = inject(RetrospectiveApi);
  private readonly session = inject(SessionService);
  readonly statuses = RETROSPECTIVE_STATUSES;
  readonly statusLabel = retrospectiveStatusLabel;
  readonly badge = retrospectiveBadge();
  readonly result = signal<RetrospectivePage | null>(null);
  readonly error = signal('');
  status: RetrospectiveStatus | '' = '';
  search = '';
  page = 1;

  ngOnInit(): void {
    this.load();
  }

  /** Either section owner records a past outcome; an import is the commercial owner's (it carries the money). */
  canRecord(): boolean {
    return (
      this.session.hasPermission(PERFORMANCE_PERMISSIONS.editCommercial) ||
      this.session.hasPermission(PERFORMANCE_PERMISSIONS.editExecution)
    );
  }

  canImport(): boolean {
    return this.session.hasPermission(PERFORMANCE_PERMISSIONS.editCommercial);
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
    this.error.set('');
    this.api.list({ status: this.status, search: this.search, page: this.page }).subscribe({
      next: (page) => this.result.set(page),
      error: (error: unknown) => this.error.set(performanceProblemMessage(error)),
    });
  }
}
