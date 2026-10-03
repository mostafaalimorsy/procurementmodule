import { Component, OnInit, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Route, Router, RouterLink } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { TENANT_PERMISSIONS } from '../identity/tenant-identity.api';
import { PROJECTS_FEATURE, PROJECT_PERMISSIONS } from '../projects/projects.api';
import { DashboardView } from '../intelligence/dashboard';
import { HealthService } from './health.service';
import { StatusIndicator } from '../../shared/ui/status-indicator';
import { SetupChecklist } from './setup-checklist';

interface RoleLink {
  readonly path: string;
  readonly label: string;
  readonly query?: Record<string, string>;
  readonly fragment?: string;
}

@Component({
  selector: 'app-overview',
  imports: [RouterLink, StatusIndicator, DashboardView, SetupChecklist],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
})
export class Overview implements OnInit {
  protected readonly health = inject(HealthService);
  protected readonly session = inject(SessionService);
  protected readonly companyWorkspaceLabel = $localize`:@@overview.companyWorkspace:YOUR COMPANY WORKSPACE`;
  protected readonly teamMemberLabel = $localize`:@@overview.teamMember:team member`;
  private readonly entitlements = inject(EntitlementsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly routeParams = toSignal(this.route.queryParamMap, { initialValue: null });
  protected readonly routeNotice = computed(() => {
    const params = this.routeParams();
    if (params?.get('access') === 'denied') {
      // CF-011: name the page from the router's own titles (only known route paths), and who can grant access. Runtime validation D3: the
      // Company Admin is not sent to ask themselves — their role administers the company, procurement work belongs to the procurement roles.
      const page = this.pageTitle(params.get('page'));
      if (page && this.session.hasPermission(TENANT_PERMISSIONS.usersView))
        return $localize`:@@overview.accessDeniedAdmin:You do not have access to ${page}:page:. The Company Admin role administers the company; give the procurement roles to the people who do this work.`;
      return page
        ? $localize`:@@overview.accessDeniedPage:You do not have access to ${page}:page:. Ask your Company Admin if you need it.`
        : $localize`:@@overview.accessDenied:You do not have access to that page. Choose an available workspace action below.`;
    }
    if (params?.get('plan') === 'unavailable')
      return $localize`:@@overview.planUnavailable:This capability is not included in your company’s current plan.`;
    return '';
  });
  private pageTitle(path: string | null): string | null {
    if (!path) return null;
    const found = (routes: readonly Route[]): Route | undefined => {
      for (const route of routes) {
        if (route.path === path) return route;
        const child = route.children ? found(route.children) : undefined;
        if (child) return child;
      }
      return undefined;
    };
    const title = found(this.router.config)?.title;
    return typeof title === 'string' ? (title.split(' | ')[0] ?? null) : null;
  }

  protected readonly canViewProjects = computed(
    () =>
      this.session.hasPermission(PROJECT_PERMISSIONS.view) &&
      this.entitlements.has(PROJECTS_FEATURE),
  );
  protected readonly canManageUsers = computed(() =>
    this.session.hasPermission(TENANT_PERMISSIONS.usersView),
  );
  /** CF-016: the service-connection diagnostics belong to the Company Admin; everyone else sees a banner only when it fails. */
  /** CF-016 / CF-100: the service check belongs to the Company Admin; the public page shows only the outage banner. */
  protected readonly showDiagnostics = computed(
    () => this.session.identity()?.roles.includes('CompanyAdmin') ?? false,
  );
  /** CF-016: one secondary link by role, beside My work. */
  protected readonly roleLink = computed<RoleLink | null>(() => {
    const roles = this.session.identity()?.roles ?? [];
    const has = (role: string) => roles.includes(role);
    const link = (
      path: string,
      label: string,
      query?: Record<string, string>,
      fragment?: string,
    ): RoleLink => ({
      path,
      label,
      query,
      fragment,
    });
    if (has('CompanyAdmin'))
      return link('/admin/company', $localize`:@@overview.link.companySetup:Company setup`);
    if (has('ApproverDirector'))
      return link(
        '/',
        $localize`:@@overview.link.myApprovals:Awaiting my approval`,
        undefined,
        'my-work-title',
      );
    if (has('ProcurementManager'))
      return link('/tenders', $localize`:@@overview.link.tenders:Tenders in progress`);
    if (has('ProcurementOfficer'))
      return link('/sourcing', $localize`:@@overview.link.sourcing:Sourcing and tenders`);
    if (has('TechnicalEvaluator'))
      return link('/tenders', $localize`:@@overview.link.evaluations:My evaluations`, {
        stage: 'Opened',
      });
    if (has('CommercialQs'))
      return link('/tenders', $localize`:@@overview.link.leveling:Leveling to complete`, {
        stage: 'Opened',
      });
    if (has('ProjectManager'))
      return link('/closeouts', $localize`:@@overview.link.closeouts:Closeouts due`, {
        status: 'Pending',
      });
    return null;
  });

  ngOnInit(): void {
    this.health.check();
  }
}
