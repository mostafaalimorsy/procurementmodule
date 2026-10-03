import { sumAmounts } from '../../core/localization/money';
import { BusinessDatePipe, BusinessCurrencyPipe } from '../../core/localization/business-format';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { SessionService } from '../../core/auth/session.service';
import {
  PROJECT_PERMISSIONS,
  PROJECT_STATUS_INTENT,
  Paged,
  ProjectDetail as Project,
  ProjectStatus,
  ProjectsApi,
  WorkPackageSummary,
  projectProblemMessage,
  projectStatusLabel,
  PROJECT_STATUS_ACTION,
  lifecycleActionClass,
} from './projects.api';

@Component({
  selector: 'app-project-detail',
  imports: [FormsModule, RouterLink, BusinessDatePipe, BusinessCurrencyPipe, ConfirmDialog],
  templateUrl: './project-detail.html',
})
export class ProjectDetailPage implements OnInit {
  private readonly api = inject(ProjectsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);

  readonly permissions = PROJECT_PERMISSIONS;
  readonly statusLabel = projectStatusLabel;
  readonly statusIntent = PROJECT_STATUS_INTENT;
  /** CF-019: the dialog's other choice says what it keeps. */
  readonly keepLabel = $localize`:@@project.keep:Keep project as it is`;

  /** CF-102: the move named as a verb ("Resume project" from on hold). */
  actionLabel(next: ProjectStatus, current: ProjectStatus): string {
    return next === 'Active' && current === 'OnHold'
      ? $localize`:@@projectAction.resume:Resume project`
      : PROJECT_STATUS_ACTION[next];
  }

  readonly actionClass = lifecycleActionClass;
  readonly project = signal<Project | null>(null);
  readonly packages = signal<Paged<WorkPackageSummary> | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  /** The lifecycle move awaiting confirmation. Null means no dialog is open. */
  readonly pendingStatus = signal<ProjectStatus | null>(null);

  packageSearch = '';
  completionDate = '';
  packagePage = 1;
  private id = '';

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
  }

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  /** Re-audit D (ADR-174): a project is edited by those who create projects, or by its own assigned manager. */
  mayEdit(project: { projectManagerAccountId?: string | null }): boolean {
    if (!this.can(this.permissions.edit)) return false;
    return (
      this.can(this.permissions.create) ||
      project.projectManagerAccountId === this.session.identity()?.userId
    );
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getProject(this.id).subscribe({
      next: (project) => {
        this.project.set(project);
        this.loading.set(false);
        this.loadPackages();
      },
      error: (error: unknown) => {
        this.error.set(projectProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  searchPackages(): void {
    this.packagePage = 1;
    this.loadPackages();
  }

  goToPackagePage(page: number): void {
    const total = this.packages()?.totalPages ?? 1;
    this.packagePage = Math.min(Math.max(1, page), Math.max(1, total));
    this.loadPackages();
  }

  loadPackages(): void {
    if (!this.can(this.permissions.packagesView)) return;
    this.api
      .listWorkPackages(this.id, { search: this.packageSearch, page: this.packagePage })
      .subscribe({
        next: (result) => this.packages.set(result),
        error: (error: unknown) => this.error.set(projectProblemMessage(error, 'workPackage')),
      });
  }

  ask(status: ProjectStatus): void {
    this.notice.set('');
    this.error.set('');
    this.completionDate = '';
    this.pendingStatus.set(status);
  }

  dismiss(): void {
    this.pendingStatus.set(null);
  }

  confirm(): void {
    const project = this.project();
    const status = this.pendingStatus();
    if (!project || !status || this.busy()) return;
    this.busy.set(true);
    this.api
      .changeProjectStatus(
        project.id,
        status,
        project.version,
        status === 'Completed' ? blankToNull(this.completionDate) : null,
      )
      .subscribe({
        next: (updated) => {
          this.project.set(updated);
          this.notice.set(
            $localize`:@@project.moved:Project moved to ${this.statusLabel(updated.status)}:status:.`,
          );
          this.busy.set(false);
          this.pendingStatus.set(null);
        },
        error: (error: unknown) => {
          this.error.set(projectProblemMessage(error));
          this.busy.set(false);
          this.pendingStatus.set(null);
        },
      });
  }

  /** CF-037 (ADR-087): the estimate column exists only for readers the server shows estimates to. */
  readonly estimatesVisible = computed(() =>
    (this.packages()?.items ?? []).some((item) => item.estimateVisible),
  );

  /** Exact sum of the package estimates (decimal strings, never floating point — CF-110); null when none has one. */
  totalEstimated(): string | null {
    const amounts = (this.packages()?.items ?? [])
      .map((item) => item.estimatedValue)
      .filter((value): value is string => value !== null);
    if (amounts.length === 0) return null;
    const decimals = Math.max(...amounts.map((value) => value.split('.')[1]?.length ?? 0));
    return sumAmounts(amounts, decimals);
  }
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
