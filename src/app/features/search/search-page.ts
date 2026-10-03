import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  lifecycleStatusLabel,
  subcontractorStatusLabel,
  tenderLifecycleLabel,
  tenderStatusLabel,
} from '../../core/localization/labels';
import { problemMessage } from '../../core/localization/product-problem';
import { categoryLabel, lifecycleLabel } from '../performance/performance-labels';
import { ProjectStatus, projectStatusLabel } from '../projects/projects.api';
import {
  SEARCH_STATUSES,
  SEARCH_TYPES,
  SearchApi,
  SearchHit,
  SearchResult,
  SearchType,
} from './search.api';

/**
 * Company-wide search (Part 12): subcontractors, projects, work packages, tenders and closeouts in one place, through each module's own
 * permission-checked list search. The query lives in the address, so a search can be bookmarked, shared with a colleague (who sees only
 * what they may open) and reached with Back.
 */
@Component({
  selector: 'app-search-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
})
export class SearchPage implements OnInit, OnDestroy {
  private readonly api = inject(SearchApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly types = SEARCH_TYPES;
  readonly result = signal<SearchResult | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly categoryLabel = categoryLabel;
  private request?: Subscription;
  q = '';
  type: SearchType | '' = '';
  status = '';
  page = 1;

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.q = params.get('q') ?? '';
      const type = params.get('type');
      this.type = SEARCH_TYPES.includes(type as SearchType) ? (type as SearchType) : '';
      const status = params.get('status') ?? '';
      this.status = this.type && SEARCH_STATUSES[this.type].includes(status) ? status : '';
      this.page = Math.max(1, Number(params.get('page')) || 1);
      this.run();
    });
  }

  statuses(): readonly string[] {
    return this.type ? SEARCH_STATUSES[this.type] : [];
  }

  submit(): void {
    this.navigate({
      q: this.q.trim() || null,
      type: this.type || null,
      status: this.status || null,
      page: null,
    });
  }

  changeType(): void {
    this.status = '';
    this.submit();
  }

  showAll(type: SearchType): void {
    this.navigate({ q: this.q.trim() || null, type, status: null, page: null });
  }

  goToPage(page: number): void {
    this.navigate({ page });
  }

  typeLabel(type: SearchType | string): string {
    switch (type) {
      case 'Subcontractors':
        return $localize`:@@search.typeSubcontractors:Subcontractors`;
      case 'Projects':
        return $localize`:@@search.typeProjects:Projects`;
      case 'WorkPackages':
        return $localize`:@@search.typeWorkPackages:Work packages`;
      case 'Tenders':
        return $localize`:@@search.typeTenders:Tenders`;
      default:
        return $localize`:@@search.typeCloseouts:Closeouts`;
    }
  }

  statusLabel(type: SearchType, status: string | null): string {
    if (!status) return '';
    switch (type) {
      case 'Subcontractors':
        return subcontractorStatusLabel(status);
      case 'Projects':
        return projectStatusLabel(status as ProjectStatus);
      case 'WorkPackages':
        return lifecycleStatusLabel(status);
      case 'Tenders':
        // CF-009: hits name where the tender is (its lifecycle step); the filter still offers the stored statuses.
        return status === 'Published' ? tenderStatusLabel(status) : tenderLifecycleLabel(status);
      default:
        return lifecycleLabel(status);
    }
  }

  link(hit: SearchHit): unknown[] {
    switch (hit.type) {
      case 'Subcontractors':
        return ['/subcontractors', hit.id];
      case 'Projects':
        return ['/projects', hit.id];
      case 'WorkPackages':
        return ['/work-packages', hit.id];
      case 'Tenders':
        return ['/tenders', hit.id];
      default:
        return ['/closeouts', hit.id];
    }
  }

  totalPages(total: number, pageSize: number): number {
    return pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  }

  private navigate(params: Record<string, unknown>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }

  private run(): void {
    // The newest address wins: an earlier, slower search is cancelled instead of overwriting it.
    this.request?.unsubscribe();
    this.error.set('');
    if (!this.type && this.q.trim().length < 2) {
      this.result.set(null);
      return;
    }
    this.loading.set(true);
    this.request = this.api
      .search({ q: this.q, type: this.type || null, status: this.status || null, page: this.page })
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(problemMessage(error, { plane: 'tenant', subject: 'record' }));
          this.result.set(null);
          this.loading.set(false);
        },
      });
  }
}
