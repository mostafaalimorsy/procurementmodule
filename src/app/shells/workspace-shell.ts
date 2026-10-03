import { BusinessDatePipe } from '../core/localization/business-format';
import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { EntitlementsService } from '../core/auth/entitlements.service';
import { IdleWatch } from '../core/auth/idle-watch';
import { SessionService } from '../core/auth/session.service';
import { tenantRoleLabel } from '../core/auth/tenant-role-labels';
import { LanguageSelector } from '../core/localization/language-selector';
import { ConfirmDialog } from '../shared/ui/confirm-dialog';
import { TENANT_PERMISSIONS } from '../features/identity/tenant-identity.api';
import { PROJECTS_FEATURE, PROJECT_PERMISSIONS } from '../features/projects/projects.api';
import {
  DIRECTORY_FEATURE,
  DIRECTORY_PERMISSIONS,
} from '../features/subcontractors/subcontractors.api';
import { SOURCING_FEATURES, SOURCING_PERMISSIONS } from '../features/sourcing/sourcing.api';
import { TENDERING_FEATURES, TENDER_PERMISSIONS } from '../features/tendering/tendering.api';
import { EVALUATION_FEATURES, EVALUATION_PERMISSIONS } from '../features/evaluation/evaluation.api';
import { AWARD_FEATURES, DECISION_PERMISSIONS } from '../features/decision/decision.api';
import {
  PERFORMANCE_FEATURES,
  PERFORMANCE_PERMISSIONS,
} from '../features/performance/performance.api';
import { COMPANY_EMAIL_PERMISSION } from '../features/email/email.api';
import { COMPANY_PROFILE_PERMISSION } from '../features/company/company.api';
import { AUDIT_PERMISSION } from '../features/audit/audit.api';
import {
  INTELLIGENCE_FEATURES,
  METRICS_PERMISSION,
} from '../features/intelligence/intelligence.api';

type WorkspaceSection =
  | 'overview'
  | 'policies'
  | 'recommendationPolicies'
  | 'approvalMatrix'
  | 'projects'
  | 'sourcing'
  | 'tenders'
  | 'closeouts'
  | 'retrospective'
  | 'subcontractors'
  | 'users'
  | 'email'
  | 'company'
  | 'search'
  | 'audit'
  | 'pilotMetrics'
  | 'signin'
  | null;

/**
 * The company workspace: every tenant and anonymous route. It never links to the Platform Console,
 * which is a separate trust context reached by its own address.
 */
@Component({
  selector: 'app-workspace-shell',
  imports: [RouterLink, RouterOutlet, LanguageSelector, BusinessDatePipe, ConfirmDialog],
  templateUrl: './workspace-shell.html',
  host: { '(document:keydown.escape)': 'closeMenu($event)' },
})
export class WorkspaceShell implements OnInit {
  protected readonly session = inject(SessionService);
  protected readonly entitlements = inject(EntitlementsService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  protected readonly signingOut = signal(false);
  protected readonly menuOpen = signal(false);
  /** CF-087: "Sign out on all devices" asks first; it ends sessions on other devices too. */
  protected readonly confirmingSignOutAll = signal(false);
  protected readonly signOutAllLabel = $localize`:@@shell.logoutEverywhere:Sign out on all devices`;
  protected readonly staySignedInLabel = $localize`:@@shell.staySignedIn:Stay signed in`;
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** One active section at a time, derived from the address rather than from what was clicked. */
  protected readonly section = computed<WorkspaceSection>(() => {
    const path = (this.url() ?? '').split(/[?#]/)[0];
    if (path === '/' || path === '') return 'overview';
    if (path.startsWith('/projects') || path.startsWith('/work-packages')) return 'projects';
    if (path.startsWith('/sourcing')) return 'sourcing';
    if (path.startsWith('/tenders')) return 'tenders';
    if (path.startsWith('/closeouts')) return 'closeouts';
    if (path.startsWith('/retrospective-outcomes')) return 'retrospective';
    if (path.startsWith('/evaluation-policies')) return 'policies';
    if (path.startsWith('/recommendation-policies')) return 'recommendationPolicies';
    if (path.startsWith('/approval-matrix')) return 'approvalMatrix';
    if (path.startsWith('/search')) return 'search';
    if (path.startsWith('/admin/audit')) return 'audit';
    if (path.startsWith('/pilot-metrics')) return 'pilotMetrics';
    if (path.startsWith('/admin/email')) return 'email';
    if (path.startsWith('/admin/company')) return 'company';
    if (path.startsWith('/subcontractors')) return 'subcontractors';
    if (path.startsWith('/admin/users')) return 'users';
    if (path.startsWith('/login')) return 'signin';
    return null;
  });

  protected readonly roleLabel = computed(() => {
    const role = this.session.identity()?.roles[0];
    return role ? tenantRoleLabel(role) : '';
  });

  protected readonly idle = inject(IdleWatch);
  private readonly destroyRef = inject(DestroyRef);
  constructor() {
    // Entitlements belong to the signed-in company, so they follow the session rather than the
    // application lifetime; purchased navigation appears on sign-in and leaves on sign-out.
    effect(() => {
      if (this.session.identity()) this.entitlements.load().subscribe();
      else this.entitlements.clear();
    });
    // A route change is the end of a menu interaction on small screens. Only an actual change closes the menus: the effect's first run can
    // be deferred to the change detection a user's first keypress triggers, and must not close a disclosure that keypress just opened.
    let lastUrl: string | undefined;
    effect(() => {
      const url = this.url();
      const changed = lastUrl !== undefined && url !== lastUrl;
      lastUrl = url;
      if (!changed) return;
      this.menuOpen.set(false);
      this.closeSettingsDisclosure();
    });
  }

  ngOnInit(): void {
    this.session.load().subscribe();
    // CF-068 (ADR-146): warn two minutes before the company's idle timeout; at the timeout the server has already ended the session.
    const timer = setInterval(() => {
      const identity = this.session.identity();
      if (!identity) return;
      this.idle.check(identity.idleTimeoutMinutes);
      if (this.idle.expired()) {
        this.session.clear();
        void this.router.navigate(['/login'], { queryParams: { expired: 1 } });
      }
    }, 15_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  /** CF-068: any request counts as activity; reading the session is the lightest one. */
  protected staySignedIn(): void {
    this.session.load().subscribe();
  }

  /** Navigation is presentation: the API re-decides permission and entitlement on every call. */
  protected showProjects(): boolean {
    return (
      this.session.hasPermission(PROJECT_PERMISSIONS.view) &&
      this.entitlements.has(PROJECTS_FEATURE)
    );
  }

  protected showSubcontractors(): boolean {
    return (
      this.session.hasPermission(DIRECTORY_PERMISSIONS.view) &&
      this.entitlements.has(DIRECTORY_FEATURE)
    );
  }

  protected showSourcing(): boolean {
    return (
      this.session.hasPermission(SOURCING_PERMISSIONS.view) &&
      SOURCING_FEATURES.every((feature) => this.entitlements.has(feature))
    );
  }

  /** Part 9: the company's technical scorecard policies — CF-133: for everyone who may read them (changed only by their managers). */
  protected showPolicies(): boolean {
    return (
      (this.session.hasPermission(EVALUATION_PERMISSIONS.managePolicy) ||
        this.session.hasPermission(EVALUATION_PERMISSIONS.view)) &&
      EVALUATION_FEATURES.every((feature) => this.entitlements.has(feature))
    );
  }

  /** Part 10: the recommendation policies — CF-133: for everyone who may read them. */
  protected showRecommendationPolicies(): boolean {
    return (
      (this.session.hasPermission(DECISION_PERMISSIONS.managePolicy) ||
        this.session.hasPermission(DECISION_PERMISSIONS.view)) &&
      AWARD_FEATURES.every((feature) => this.entitlements.has(feature))
    );
  }

  /** CF-136: approvers and submitters read the approval routes that apply to their work. */
  protected showApprovalRoutes(): boolean {
    return (
      (this.session.hasPermission(DECISION_PERMISSIONS.approve) ||
        this.session.hasPermission(DECISION_PERMISSIONS.submit)) &&
      AWARD_FEATURES.every((feature) => this.entitlements.has(feature))
    );
  }

  /** CF-012 (ADR-158, B-012-2): the Settings group shows when any of its pages (now including the pilot metrics) is available. */
  protected showSettings(): boolean {
    return (
      this.showPolicies() ||
      this.showRecommendationPolicies() ||
      this.showApprovalMatrix() ||
      this.showApprovalRoutes() ||
      this.showAudit() ||
      this.showPilotMetrics() ||
      this.showCompanyUsers() ||
      this.showCompanyEmail() ||
      this.showCompanySettings()
    );
  }

  /** Whether the open page is one of the Settings group's (the group is then marked current). */
  protected readonly settingsSection = computed(() =>
    [
      'policies',
      'recommendationPolicies',
      'approvalMatrix',
      'audit',
      'pilotMetrics',
      'users',
      'email',
      'company',
    ].includes(this.section() ?? ''),
  );
  /**
   * Mirrors the Settings disclosure (from its toggle event). The element owns the open state — no [open] binding: a binding written by a
   * later change detection could close a disclosure the user had just reopened (final-gate finding) — and the shell closes it directly.
   */
  protected readonly settingsOpen = signal(false);

  private closeSettingsDisclosure(): void {
    const details = this.document.querySelector<HTMLDetailsElement>('details.nav-settings');
    if (details?.open) details.open = false;
    this.settingsOpen.set(false);
  }

  /** CF-012 AC5 (B-012-4): Escape closes the Settings disclosure and returns focus to its summary. */
  protected closeSettings(event: Event): void {
    const details = event.currentTarget as HTMLDetailsElement | null;
    if (!details?.open && !this.settingsOpen()) return;
    event.stopPropagation();
    // Focus moves to the summary first: hiding the menu while focus is inside it would drop focus to the page (final-gate finding).
    this.document.getElementById('nav-settings-summary')?.focus();
    if (details) details.open = false;
    this.settingsOpen.set(false);
  }

  protected showApprovalMatrix(): boolean {
    return (
      this.session.hasPermission(DECISION_PERMISSIONS.manageMatrix) &&
      AWARD_FEATURES.every((feature) => this.entitlements.has(feature))
    );
  }

  protected showTenders(): boolean {
    return (
      this.session.hasPermission(TENDER_PERMISSIONS.view) &&
      TENDERING_FEATURES.every((feature) => this.entitlements.has(feature))
    );
  }

  /** Part 11: performance closeout of awards, for the people who record or read outcomes. */
  protected showCloseouts(): boolean {
    return (
      this.session.hasPermission(PERFORMANCE_PERMISSIONS.view) &&
      PERFORMANCE_FEATURES.every((feature) => this.entitlements.has(feature))
    );
  }

  /** CF-080 (ADR-131): the pilot metrics, for procurement leadership, the Director and administration, in plans with intelligence. */
  protected showPilotMetrics(): boolean {
    return (
      this.session.hasPermission(METRICS_PERMISSION) &&
      INTELLIGENCE_FEATURES.every((feature) => this.entitlements.has(feature))
    );
  }

  /** Part 12: the company audit log, for company administration. */
  protected showAudit(): boolean {
    return this.session.hasPermission(AUDIT_PERMISSION);
  }

  protected showCompanyEmail(): boolean {
    return this.session.hasPermission(COMPANY_EMAIL_PERMISSION);
  }

  protected showCompanySettings(): boolean {
    return this.session.hasPermission(COMPANY_PROFILE_PERMISSION);
  }

  protected showCompanyUsers(): boolean {
    return this.session.hasPermission(TENANT_PERMISSIONS.usersView);
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(event?: Event): void {
    if (!this.menuOpen() || this.confirmingSignOutAll()) return;
    // Re-audit N: an Escape that closed a dialog (it reaches the document after the dialog already closed) only closes that dialog; focus
    // returns to the dialog's opener, not to the menu toggle.
    const target = event?.target;
    if (target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"]'))
      return;
    this.menuOpen.set(false);
    this.document.getElementById('workspace-menu-toggle')?.focus();
  }

  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.document.getElementById('main-content')?.focus();
  }

  protected get skipHref(): string {
    return `${this.document.location.pathname}${this.document.location.search}#main-content`;
  }

  protected confirmSignOutAll(): void {
    this.confirmingSignOutAll.set(false);
    this.logout(true);
  }

  /** CF-087 (ADR-161): "Sign out" ends this device's session; "Sign out on all devices" every session of the account. */
  logout(everywhere = false): void {
    if (this.signingOut()) return;
    // SessionService clears identity synchronously. Removing the outlet in the same turn ensures
    // project and user data cannot remain painted while the server revokes the cookie.
    this.signingOut.set(true);
    this.menuOpen.set(false);
    const logout = this.session.logout(everywhere);
    const navigation = this.router.navigateByUrl('/', { replaceUrl: true });
    logout.subscribe({
      complete: () => void navigation.finally(() => this.signingOut.set(false)),
      error: () => void navigation.finally(() => this.signingOut.set(false)),
    });
  }
}
