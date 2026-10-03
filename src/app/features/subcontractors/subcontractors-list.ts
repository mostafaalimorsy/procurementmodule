import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, Subject, catchError, debounceTime, map, merge, of, switchMap } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { DirectoryHistoryChip } from '../intelligence/history-chips';
import { countryName, placeName } from '../../core/localization/countries';
import {
  DIRECTORY_PERMISSIONS,
  DirectoryApi,
  DirectoryListOptions,
  Paged,
  SUBCONTRACTOR_STATUSES,
  SubcontractorStatus,
  SubcontractorSummary,
  Trade,
  directoryProblemMessage,
  statusLabel,
} from './subcontractors.api';

type Outcome = { readonly page: Paged<SubcontractorSummary> } | { readonly error: string };

@Component({
  selector: 'app-subcontractors-list',
  imports: [FormsModule, RouterLink, BusinessDatePipe, DirectoryHistoryChip],
  templateUrl: './subcontractors-list.html',
})
export class SubcontractorsList implements OnInit {
  private readonly api = inject(DirectoryApi);
  private readonly session = inject(SessionService);
  // Typing is debounced; every other trigger (first load, filters, sort, paging, retry) runs at once.
  private readonly typed = new Subject<void>();
  private readonly immediate = new Subject<void>();

  readonly permissions = DIRECTORY_PERMISSIONS;
  readonly statuses = SUBCONTRACTOR_STATUSES;
  readonly statusLabel = statusLabel;
  readonly countryName = countryName;
  readonly result = signal<Paged<SubcontractorSummary> | null>(null);
  readonly trades = signal<readonly Trade[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  search = '';
  status: SubcontractorStatus | '' = '';
  tradeId = '';
  sortBy: NonNullable<DirectoryListOptions['sortBy']> = 'LegalName';
  desc = false;
  page = 1;
  readonly pageSize = 20;

  ngOnInit(): void {
    // One request in flight: switchMap drops a superseded search. A failure is caught per request, so
    // the stream survives it and "Try again" still works.
    merge(this.immediate, this.typed.pipe(debounceTime(250)))
      .pipe(switchMap(() => this.fetch()))
      .subscribe((outcome) => {
        if ('page' in outcome) this.result.set(outcome.page);
        else this.error.set(outcome.error);
        this.loading.set(false);
      });
    this.api
      .trades()
      .subscribe({ next: (trades) => this.trades.set(trades), error: () => this.trades.set([]) });
    this.reload();
  }

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  sortState(
    field: NonNullable<DirectoryListOptions['sortBy']>,
  ): 'ascending' | 'descending' | 'none' {
    if (this.sortBy !== field) return 'none';
    return this.desc ? 'descending' : 'ascending';
  }

  /** Any filter change returns to the first page. */
  applyFilters(): void {
    this.page = 1;
    this.reload();
  }

  sortByField(field: NonNullable<DirectoryListOptions['sortBy']>): void {
    if (this.sortBy === field) this.desc = !this.desc;
    else {
      this.sortBy = field;
      this.desc = field === 'UpdatedAt';
    }
    this.applyFilters();
  }

  goToPage(page: number): void {
    const total = this.result()?.totalPages ?? 1;
    this.page = Math.min(Math.max(1, page), Math.max(1, total));
    this.reload();
  }

  clearFilters(): void {
    this.search = '';
    this.status = '';
    this.tradeId = '';
    this.applyFilters();
  }

  get hasFilters(): boolean {
    return this.search.trim().length > 0 || this.status !== '' || this.tradeId !== '';
  }

  reload(): void {
    this.beginLoad();
    this.immediate.next();
  }

  searchChanged(): void {
    this.page = 1;
    this.beginLoad();
    this.typed.next();
  }

  location(item: SubcontractorSummary): string {
    return placeName(item.city, item.countryCode);
  }

  private fetch(): Observable<Outcome> {
    return this.api
      .list({
        search: this.search,
        status: this.status ? [this.status] : [],
        tradeId: this.tradeId || null,
        page: this.page,
        pageSize: this.pageSize,
        sortBy: this.sortBy,
        desc: this.desc,
      })
      .pipe(
        map((page): Outcome => ({ page })),
        catchError((error: unknown) => of<Outcome>({ error: directoryProblemMessage(error) })),
      );
  }

  private beginLoad(): void {
    this.loading.set(true);
    this.error.set('');
  }
}
