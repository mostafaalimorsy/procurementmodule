import { BusinessDatePipe, BusinessNumberPipe } from '../../core/localization/business-format';
import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, debounceTime, merge, switchMap } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import {
  PROJECT_PERMISSIONS,
  PROJECT_STATUSES,
  Paged,
  ProjectListOptions,
  ProjectStatus,
  ProjectSummary,
  ProjectsApi,
  projectProblemMessage,
  projectStatusLabel,
} from './projects.api';

@Component({
  selector: 'app-projects-list',
  imports: [FormsModule, RouterLink, BusinessDatePipe, BusinessNumberPipe],
  templateUrl: './projects-list.html',
})
export class ProjectsList implements OnInit {
  private readonly api = inject(ProjectsApi);
  private readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  // Typing is debounced so a search does not fire per keystroke; every other trigger - first load,
  // filter, sort, paging, retry - runs at once, because making a user wait 250ms to see their own
  // portfolio would be a self-inflicted delay.
  private readonly typed = new Subject<void>();
  private readonly immediate = new Subject<void>();

  readonly permissions = PROJECT_PERMISSIONS;
  readonly statuses = PROJECT_STATUSES;
  readonly statusLabel = projectStatusLabel;
  readonly result = signal<Paged<ProjectSummary> | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  search = '';
  status: ProjectStatus | '' = '';
  /** CF-036: a Project Manager opens on the projects they are assigned to; anyone can switch to the whole portfolio. */
  mine = false;
  /** Whether the "mine" default was applied: on a full page load the session arrives after the first render (runtime validation D4). */
  private mineDefaulted = false;
  sortBy: NonNullable<ProjectListOptions['sortBy']> = 'UpdatedAt';
  desc = true;
  page = 1;
  readonly pageSize = 20;

  constructor() {
    effect(() => {
      const identity = this.session.identity();
      if (!identity || this.mineDefaulted) return;
      this.mineDefaulted = true;
      if (!this.mine && identity.roles.includes('ProjectManager')) {
        this.mine = true;
        this.page = 1;
        this.reload();
      }
    });
  }

  ngOnInit(): void {
    // Part 12: a dashboard link may open the list already filtered.
    const status = this.route.snapshot?.queryParamMap?.get('status') ?? null;
    if (this.statuses.includes(status as ProjectStatus)) this.status = status as ProjectStatus;
    this.mine = this.isProjectManager();
    this.mineDefaulted = this.session.identity() !== null;
    // One in-flight request at a time: switchMap drops a superseded search so a slow early response
    // can never overwrite the results of a later keystroke.
    merge(this.immediate, this.typed.pipe(debounceTime(250)))
      .pipe(switchMap(() => this.api.listProjects(this.options())))
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(projectProblemMessage(error));
          this.loading.set(false);
        },
      });
    this.reload();
  }

  isProjectManager(): boolean {
    return this.session.identity()?.roles.includes('ProjectManager') ?? false;
  }

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  /** Announces the current ordering to assistive technology, not just the arrow a sighted user sees. */
  sortState(field: NonNullable<ProjectListOptions['sortBy']>): 'ascending' | 'descending' | 'none' {
    if (this.sortBy !== field) return 'none';
    return this.desc ? 'descending' : 'ascending';
  }

  /** Any filter change returns to the first page: page 3 of a new result set is meaningless. */
  applyFilters(): void {
    this.page = 1;
    this.reload();
  }

  sortByField(field: NonNullable<ProjectListOptions['sortBy']>): void {
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
    this.mine = false;
    this.applyFilters();
  }

  get hasFilters(): boolean {
    return this.search.trim().length > 0 || this.status !== '' || this.mine;
  }

  /** Re-runs the current query at once. */
  reload(): void {
    this.beginLoad();
    this.immediate.next();
  }

  /** Called while the user types: same query, but debounced. */
  searchChanged(): void {
    this.page = 1;
    this.beginLoad();
    this.typed.next();
  }

  private beginLoad(): void {
    this.loading.set(true);
    this.error.set('');
  }

  private options(): ProjectListOptions {
    return {
      search: this.search,
      status: this.status ? [this.status] : [],
      projectManager: this.mine ? this.session.identity()?.userId : undefined,
      page: this.page,
      pageSize: this.pageSize,
      sortBy: this.sortBy,
      desc: this.desc,
    };
  }
}
