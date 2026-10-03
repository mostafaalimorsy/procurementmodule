import { BusinessDatePipe, BusinessCurrencyPipe } from '../../core/localization/business-format';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { WorkPackageSourcing } from '../sourcing/work-package-sourcing';
import { WorkPackageTender } from '../tendering/work-package-tender';
import { SessionService } from '../../core/auth/session.service';
import {
  PROJECT_PERMISSIONS,
  ProjectsApi,
  WorkPackageDetail,
  WorkPackageStatus,
  projectProblemMessage,
  projectStatusLabel,
  WORK_PACKAGE_STATUS_ACTION,
  lifecycleActionClass,
} from './projects.api';

@Component({
  selector: 'app-work-package-detail',
  imports: [
    FormsModule,
    RouterLink,
    BusinessDatePipe,
    BusinessCurrencyPipe,
    ConfirmDialog,
    WorkPackageSourcing,
    WorkPackageTender,
  ],
  templateUrl: './work-package-detail.html',
})
export class WorkPackageDetailPage implements OnInit {
  private readonly api = inject(ProjectsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  readonly permissions = PROJECT_PERMISSIONS;
  readonly statusLabel = projectStatusLabel;
  readonly item = signal<WorkPackageDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly pendingStatus = signal<WorkPackageStatus | null>(null);
  /** CF-019: the dialog's other choice says what it keeps. */
  readonly keepLabel = $localize`:@@package.keep:Keep work package as it is`;

  /** CF-102: the move named as a verb ("Resume work package" from on hold). */
  actionLabel(next: WorkPackageStatus, current: WorkPackageStatus): string {
    return next === 'Active' && current === 'OnHold'
      ? $localize`:@@packageAction.resume:Resume work package`
      : WORK_PACKAGE_STATUS_ACTION[next];
  }

  readonly actionClass = lifecycleActionClass;
  readonly cloning = signal(false);
  cloneCode = '';
  cloneTitle = '';
  private id = '';

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('packageId') ?? '';
    this.load();
  }

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  /** A closed engagement accepts no new active work, so those moves are not offered. */
  offered(status: WorkPackageStatus): boolean {
    const current = this.item();
    if (!current) return false;
    const projectClosed =
      current.projectStatus === 'Completed' || current.projectStatus === 'Cancelled';
    return !(projectClosed && (status === 'Active' || status === 'OnHold'));
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getWorkPackage(this.id).subscribe({
      next: (item) => {
        this.item.set(item);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(projectProblemMessage(error, 'workPackage'));
        this.loading.set(false);
      },
    });
  }

  ask(status: WorkPackageStatus): void {
    this.notice.set('');
    this.error.set('');
    this.pendingStatus.set(status);
  }

  dismiss(): void {
    this.pendingStatus.set(null);
  }

  confirm(): void {
    const current = this.item();
    const status = this.pendingStatus();
    if (!current || !status || this.busy()) return;
    this.busy.set(true);
    this.api.changeWorkPackageStatus(current.id, status, current.version).subscribe({
      next: (updated) => {
        this.item.set(updated);
        this.notice.set(
          $localize`:@@packages.moved:Work package moved to ${this.statusLabel(updated.status)}:status:.`,
        );
        this.busy.set(false);
        this.pendingStatus.set(null);
      },
      error: (error: unknown) => {
        this.error.set(projectProblemMessage(error, 'workPackage'));
        this.busy.set(false);
        this.pendingStatus.set(null);
      },
    });
  }

  /** CF-057: opens the small form for a new package based on this one. */
  startClone(): void {
    const current = this.item();
    if (!current) return;
    this.notice.set('');
    this.error.set('');
    this.cloneCode = '';
    this.cloneTitle = current.title;
    this.cloning.set(true);
  }

  submitClone(): void {
    const current = this.item();
    if (!current || this.busy() || !this.cloneCode.trim()) return;
    this.busy.set(true);
    this.api
      .cloneWorkPackage(current.id, {
        code: this.cloneCode.trim(),
        title: this.cloneTitle.trim() || null,
      })
      .subscribe({
        next: (created) => {
          this.busy.set(false);
          this.cloning.set(false);
          this.id = created.id;
          this.item.set(created);
          this.notice.set(
            $localize`:@@packages.cloned:New work package created from ${current.code}:code:. Add its estimate and dates.`,
          );
          void this.router.navigate(['/work-packages', created.id]);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(projectProblemMessage(error, 'workPackage'));
        },
      });
  }
}
