import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CompanyPlanPanel } from './company-plan-panel';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { identityMailLabel, ltr } from '../../core/localization/labels';
import { SessionService } from '../../core/auth/session.service';
import {
  CompanyAllowList,
  CompanyPlan,
  CompanySecurity,
  PREDEFINED_ROLES,
  PredefinedRole,
  TENANT_PERMISSIONS,
  TenantIdentityApi,
  QuotaState,
  TenantUser,
  roleLabel,
  tenantProblemMessage,
  userStatusLabel,
} from './tenant-identity.api';

@Component({
  selector: 'app-users-admin',
  imports: [FormsModule, RouterLink, CompanyPlanPanel, ConfirmDialog, BusinessDatePipe],
  templateUrl: './users-admin.html',
  styleUrl: './users-admin.scss',
})
export class UsersAdmin implements OnInit {
  private readonly api = inject(TenantIdentityApi);
  protected readonly session = inject(SessionService);
  readonly users = signal<TenantUser[]>([]);
  readonly plan = signal<CompanyPlan | null>(null);
  /** Red-team B-115-2 (CF-115 AC6): who may be invited, read only; absent when it cannot be read (the invitation is still checked). */
  readonly allowList = signal<CompanyAllowList | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busyAction = signal('');
  readonly roles = PREDEFINED_ROLES;
  readonly permissions = TENANT_PERMISSIONS;
  readonly statusLabel = userStatusLabel;
  readonly mailLabel = identityMailLabel;
  readonly roleLabel = roleLabel;
  readonly roleDraft: Record<string, PredefinedRole> = {};
  /** CF-035: the additional roles being edited per user (at most two; Company Admin is only ever a primary role). */
  readonly extraDraft: Record<string, PredefinedRole[]> = {};
  readonly maxAdditionalRoles = 2;
  /** Column names repeated on each cell for the stacked mobile table. */
  protected readonly labels = {
    user: $localize`:@@users.colUser:User`,
    status: $localize`:@@users.colStatus:Status`,
    role: $localize`:@@users.colRole:Role`,
    actions: $localize`:@@users.colActions:Actions`,
  };
  displayName = '';
  email = '';
  role: PredefinedRole = 'ProcurementOfficer';

  ngOnInit(): void {
    this.load();
    this.loadSecurity();
    if (this.can(this.permissions.usersInvite))
      this.api.allowList().subscribe({
        next: (list) => this.allowList.set(list ?? null),
        error: () => this.allowList.set(null),
      });
  }

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  invite(): void {
    if (this.busyAction()) return;
    this.start('invite');
    this.api
      .inviteUser({
        displayName: this.displayName.trim(),
        email: this.email.trim(),
        role: this.role,
      })
      .subscribe({
        next: () => {
          this.displayName = '';
          this.email = '';
          this.role = 'ProcurementOfficer';
          this.finish(
            $localize`:@@users.invited:Invitation sent. The user will choose their own password.`,
          );
          this.load(false);
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  revokeInvitation(user: TenantUser): void {
    if (this.busyAction()) return;
    this.start(`revoke:${user.id}`);
    this.api.revokeInvitation(user.id).subscribe({
      next: () => {
        this.finish(
          $localize`:@@users.revoked:Invitation to ${ltr(user.email)}:email: was revoked and its seat released.`,
        );
        this.load(false);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  /** The roles that may be added to this user's primary role. */
  additionalOptions(user: TenantUser) {
    return this.roles.filter(
      (option) => option.value !== 'CompanyAdmin' && option.value !== this.roleDraft[user.id],
    );
  }

  holdsExtra(user: TenantUser, role: PredefinedRole): boolean {
    return (this.extraDraft[user.id] ?? []).includes(role);
  }

  toggleExtra(user: TenantUser, role: PredefinedRole, checked: boolean): void {
    const current = (this.extraDraft[user.id] ?? []).filter((item) => item !== role);
    this.extraDraft[user.id] = checked ? [...current, role] : current;
  }

  extraLimitReached(user: TenantUser, role: PredefinedRole): boolean {
    return (
      !this.holdsExtra(user, role) &&
      (this.extraDraft[user.id] ?? []).filter((item) => item !== this.roleDraft[user.id]).length >=
        this.maxAdditionalRoles
    );
  }

  rolesChanged(user: TenantUser): boolean {
    const extras = (this.extraDraft[user.id] ?? []).filter(
      (item) => item !== this.roleDraft[user.id],
    );
    const before = [...(user.additionalRoles ?? [])].sort().join(',');
    return this.roleDraft[user.id] !== user.role || [...extras].sort().join(',') !== before;
  }

  saveRole(user: TenantUser): void {
    const role = this.roleDraft[user.id];
    if (!role || !this.rolesChanged(user) || this.busyAction()) return;
    this.start(`role:${user.id}`);
    const extras = (this.extraDraft[user.id] ?? []).filter((item) => item !== role);
    this.api.changeRole(user.id, role, extras).subscribe({
      next: () => {
        this.finish($localize`:@@users.roleUpdated:Role updated for ${ltr(user.email)}:email:.`);
        this.load(false);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  /** CF-114 (ADR-157): an invited account whose link no longer opens — it needs a new invitation. */
  invitationExpired(user: TenantUser): boolean {
    if (user.status !== 'Invited') return false;
    const expires = user.invitationExpiresAtUtc ? Date.parse(user.invitationExpiresAtUtc) : NaN;
    return Number.isNaN(expires) || expires <= Date.now();
  }

  /** CF-088: the signed-in administrator's own row — the server refuses every change to it. */
  isSelf(user: TenantUser): boolean {
    return user.id === this.session.identity()?.userId;
  }

  /** CF-088: suspending, forcing a reset and resetting an authenticator end the person's sessions — confirmed first. */
  readonly pending = signal<{ kind: 'suspend' | 'reset' | 'mfa'; user: TenantUser } | null>(null);

  ask(kind: 'suspend' | 'reset' | 'mfa', user: TenantUser): void {
    if (this.busyAction() || this.isSelf(user)) return;
    this.pending.set({ kind, user });
  }

  pendingHeading(kind: 'suspend' | 'reset' | 'mfa'): string {
    return kind === 'suspend'
      ? $localize`:@@users.suspendHeading:Suspend access`
      : kind === 'reset'
        ? $localize`:@@users.resetHeading:Force a password reset`
        : $localize`:@@users.mfaHeading:Reset the authenticator`;
  }

  confirmPending(): void {
    const action = this.pending();
    if (!action) return;
    this.pending.set(null);
    if (action.kind === 'suspend') this.suspend(action.user);
    else if (action.kind === 'reset') this.forceReset(action.user);
    else this.resetMfa(action.user);
  }

  suspend(user: TenantUser): void {
    this.changeStatus(
      user,
      'Suspended',
      $localize`:@@users.suspended:Access suspended for ${ltr(user.email)}:email:.`,
    );
  }

  reactivate(user: TenantUser): void {
    this.changeStatus(
      user,
      'Active',
      $localize`:@@users.restored:Access restored for ${ltr(user.email)}:email:.`,
    );
  }

  resendInvitation(user: TenantUser): void {
    if (this.busyAction()) return;
    this.start(`resend:${user.id}`);
    this.api.resendInvitation(user.id).subscribe({
      next: () =>
        this.finish(
          $localize`:@@users.resent:A new invitation was issued for ${ltr(user.email)}:email:.`,
        ),
      error: (error: unknown) => this.fail(error),
    });
  }

  /** CF-065 (ADR-145): the roles that sign in with an authenticator, as loaded and as edited. */
  readonly security = signal<CompanySecurity | null>(null);
  readonly securityRoles = signal<readonly PredefinedRole[]>([]);
  /** CF-068 (ADR-146): the idle timeout being edited. */
  idleMinutes = 60;

  private loadSecurity(): void {
    this.api.security().subscribe({
      next: (policy) => {
        this.security.set(policy);
        this.securityRoles.set(policy.mfaRequiredRoles);
        this.idleMinutes = policy.idleTimeoutMinutes ?? 60;
      },
      error: () => this.security.set(null),
    });
  }

  toggleSecurityRole(role: PredefinedRole, checked: boolean): void {
    this.securityRoles.update((current) =>
      checked
        ? [...current.filter((item) => item !== role), role]
        : current.filter((item) => item !== role),
    );
  }

  saveSecurity(): void {
    const policy = this.security();
    if (!policy || this.busyAction()) return;
    this.start('security');
    this.api.setSecurity(this.securityRoles(), policy.version, Number(this.idleMinutes)).subscribe({
      next: (saved) => {
        this.security.set(saved);
        this.securityRoles.set(saved.mfaRequiredRoles);
        this.finish($localize`:@@users.securitySaved:Sign-in security saved.`);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  resetMfa(user: TenantUser): void {
    if (this.busyAction()) return;
    this.start(`mfa:${user.id}`);
    this.api.resetMfa(user.id).subscribe({
      next: () => {
        this.finish(
          $localize`:@@users.mfaReset:The authenticator of ${ltr(user.email)}:email: was reset; they set up a new one at their next sign-in.`,
        );
        this.load(false);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  forceReset(user: TenantUser): void {
    if (this.busyAction()) return;
    this.start(`reset:${user.id}`);
    this.api.forcePasswordReset(user.id).subscribe({
      next: () => {
        this.finish(
          $localize`:@@users.resetIssued:Password reset instructions were issued for ${ltr(user.email)}:email:.`,
        );
        this.load(false);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  /** CF-071 (ADR-134): the user whose erasure waits for its second click. */
  readonly erasing = signal<string | null>(null);

  erased(user: TenantUser): boolean {
    return user.email.endsWith('@erased.invalid');
  }

  erase(user: TenantUser): void {
    if (this.busyAction()) return;
    this.start(`erase:${user.id}`);
    this.api.erase(user.id).subscribe({
      next: () => {
        this.erasing.set(null);
        this.finish(
          $localize`:@@users.erased:The former member's name and email were erased. Their activity stays in the record, attributed to an erased user.`,
        );
        this.load(false);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  isBusy(action: string, userId?: string): boolean {
    return this.busyAction() === (userId ? `${action}:${userId}` : action);
  }

  private changeStatus(user: TenantUser, status: 'Active' | 'Suspended', notice: string): void {
    if (this.busyAction()) return;
    this.start(`status:${user.id}`);
    this.api.changeStatus(user.id, status).subscribe({
      next: () => {
        this.finish(notice);
        this.load(false);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  /** Seat capacity as last reported by the server. Purely advisory: the server decides. */
  seats(): QuotaState | null {
    return this.plan()?.quotas.find((quota) => quota.key === 'max_users') ?? null;
  }

  atSeatCapacity(): boolean {
    const seats = this.seats();
    return seats !== null && seats.measured && !seats.canCreate;
  }

  private load(showLoading = true): void {
    if (showLoading) this.loading.set(true);
    this.api.listUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        for (const user of users) {
          this.roleDraft[user.id] = user.role;
          this.extraDraft[user.id] = [...(user.additionalRoles ?? [])];
        }
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(tenantProblemMessage(error));
        this.loading.set(false);
      },
    });
    // The plan is advisory context for the operator of this screen; a failure must not block it.
    this.api.companyPlan().subscribe({
      next: (plan) => this.plan.set(plan),
      error: () => this.plan.set(null),
    });
  }

  private start(action: string): void {
    this.busyAction.set(action);
    this.error.set('');
    this.notice.set('');
  }

  private finish(notice: string): void {
    this.busyAction.set('');
    this.notice.set(notice);
  }

  private fail(error: unknown): void {
    this.busyAction.set('');
    this.error.set(tenantProblemMessage(error));
  }
}
