import { Routes } from '@angular/router';
import { platformGuard } from './core/auth/platform.guard';
import { permissionGuard } from './core/auth/permission.guard';
import { featureGuard } from './core/auth/feature.guard';
import { PROJECTS_FEATURE, PROJECT_PERMISSIONS } from './features/projects/projects.api';
import {
  DIRECTORY_FEATURE,
  DIRECTORY_PERMISSIONS,
} from './features/subcontractors/subcontractors.api';
import { TENANT_PERMISSIONS } from './features/identity/tenant-identity.api';
import { SOURCING_FEATURES, SOURCING_PERMISSIONS } from './features/sourcing/sourcing.api';
import { TENDERING_FEATURES, TENDER_PERMISSIONS } from './features/tendering/tendering.api';
import { EVALUATION_FEATURES, EVALUATION_PERMISSIONS } from './features/evaluation/evaluation.api';
import { AWARD_FEATURES, DECISION_PERMISSIONS } from './features/decision/decision.api';
import {
  PERFORMANCE_FEATURES,
  PERFORMANCE_PERMISSIONS,
} from './features/performance/performance.api';
import { COMPANY_EMAIL_PERMISSION } from './features/email/email.api';
import { AUDIT_PERMISSION } from './features/audit/audit.api';
import {
  INTELLIGENCE_FEATURES,
  METRICS_PERMISSION,
} from './features/intelligence/intelligence.api';
import { COMPANY_PROFILE_PERMISSION } from './features/company/company.api';

const product = $localize`:@@title.product:Subcontractor Intelligence`;
const consoleName = $localize`:@@title.console:Platform Console`;

/**
 * Two product contexts, each with its own shell. Company workspace URLs are unchanged — invitation
 * and reset links, bookmarks and deep links keep working — and the Platform Console keeps its
 * existing /platform prefix. Neither shell links to the other.
 */
export const routes: Routes = [
  {
    path: 'platform',
    loadComponent: () => import('./shells/platform-shell').then((m) => m.PlatformShell),
    children: [
      {
        path: 'login',
        title: $localize`:@@title.operatorLogin:Operator sign in | ${consoleName}:console:`,
        loadComponent: () =>
          import('./features/platform/platform-login').then((m) => m.PlatformLogin),
      },
      {
        path: 'setup',
        title: $localize`:@@title.operatorSetup:Operator setup | ${consoleName}:console:`,
        loadComponent: () =>
          import('./features/platform/operator-setup').then((m) => m.OperatorSetup),
      },
      {
        path: 'operators',
        canActivate: [platformGuard],
        title: $localize`:@@title.operators:Operators | ${consoleName}:console:`,
        loadComponent: () =>
          import('./features/platform/operators').then((m) => m.PlatformOperators),
      },
      {
        path: 'keys',
        canActivate: [platformGuard],
        title: $localize`:@@title.secretKeys:Keys | ${consoleName}:console:`,
        loadComponent: () => import('./features/platform/secret-keys').then((m) => m.SecretKeys),
      },
      {
        path: 'audit',
        canActivate: [platformGuard],
        title: $localize`:@@title.platformAudit:Platform audit | ${consoleName}:console:`,
        loadComponent: () =>
          import('./features/platform/platform-audit').then((m) => m.PlatformAudit),
      },
      {
        path: 'companies',
        canActivate: [platformGuard],
        title: $localize`:@@title.companies:Companies | ${consoleName}:console:`,
        loadComponent: () => import('./features/platform/companies').then((m) => m.Companies),
      },
      {
        path: 'companies/:id',
        canActivate: [platformGuard],
        loadComponent: () =>
          import('./features/platform/company-detail').then((m) => m.CompanyDetail),
        children: [
          {
            path: '',
            title: $localize`:@@title.companyOverview:Company overview | ${consoleName}:console:`,
            loadComponent: () =>
              import('./features/platform/company-overview').then((m) => m.CompanyOverview),
          },
          {
            path: 'plan',
            title: $localize`:@@title.companyPlan:Plan & usage | ${consoleName}:console:`,
            loadComponent: () =>
              import('./features/platform/company-plan').then((m) => m.CompanyPlanPage),
          },
          {
            path: 'access',
            title: $localize`:@@title.companyAccess:Access policy | ${consoleName}:console:`,
            loadComponent: () =>
              import('./features/platform/company-access').then((m) => m.CompanyAccess),
          },
        ],
      },
      {
        path: 'packages',
        canActivate: [platformGuard],
        title: $localize`:@@title.packages:Packages | ${consoleName}:console:`,
        loadComponent: () => import('./features/platform/packages').then((m) => m.Packages),
      },
      {
        path: 'residency',
        canActivate: [platformGuard],
        title: $localize`:@@title.residency:Residency | ${consoleName}:console:`,
        loadComponent: () =>
          import('./features/platform/residency').then((m) => m.ResidencyPolicies),
      },
      {
        path: 'email',
        canActivate: [platformGuard],
        title: $localize`:@@title.platformEmail:Email | ${consoleName}:console:`,
        loadComponent: () =>
          import('./features/email/platform-email').then((m) => m.PlatformEmailPage),
      },
      { path: '', redirectTo: 'companies', pathMatch: 'full' },
      { path: '**', redirectTo: 'companies' },
    ],
  },
  // The bidder's invitation page stands outside both product shells: an invited firm has no account here.
  {
    path: 'tender-invitation',
    loadComponent: () =>
      import('./features/bidder/tender-invitation').then((m) => m.TenderInvitationPage),
  },
  // Part 10: a selected firm's negotiation round page, reached by its own round link — also outside both shells.
  {
    path: 'tender-negotiation',
    loadComponent: () =>
      import('./features/bidder/tender-negotiation').then((m) => m.TenderNegotiationPage),
  },
  {
    path: '',
    loadComponent: () => import('./shells/workspace-shell').then((m) => m.WorkspaceShell),
    children: [
      {
        path: 'login',
        title: $localize`:@@title.login:Company sign in | ${product}:product:`,
        loadComponent: () => import('./features/identity/tenant-login').then((m) => m.TenantLogin),
      },
      {
        path: 'accept-invitation',
        title: $localize`:@@title.invitation:Activate account | ${product}:product:`,
        loadComponent: () =>
          import('./features/identity/invitation-acceptance').then((m) => m.InvitationAcceptance),
      },
      {
        path: 'forgot-password',
        title: $localize`:@@title.forgot:Forgot password | ${product}:product:`,
        loadComponent: () =>
          import('./features/identity/forgot-password').then((m) => m.ForgotPassword),
      },
      {
        path: 'reset-password',
        title: $localize`:@@title.reset:Reset password | ${product}:product:`,
        loadComponent: () =>
          import('./features/identity/reset-password').then((m) => m.ResetPassword),
      },
      // Part 12: the company-wide search (each record type is decided by its own permission on the server) and the audit log.
      {
        path: 'search',
        canActivate: [permissionGuard],
        data: { permission: 'session.read' },
        title: $localize`:@@title.search:Search | ${product}:product:`,
        loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage),
      },
      // CF-080 (ADR-131): the read-only pilot metrics.
      {
        path: 'pilot-metrics',
        canActivate: [featureGuard],
        data: { permission: METRICS_PERMISSION, feature: INTELLIGENCE_FEATURES },
        title: $localize`:@@title.pilotMetrics:Pilot metrics | ${product}:product:`,
        loadComponent: () =>
          import('./features/intelligence/pilot-metrics').then((m) => m.PilotMetricsPage),
      },
      {
        path: 'admin/audit',
        canActivate: [permissionGuard],
        data: { permission: AUDIT_PERMISSION },
        title: $localize`:@@title.audit:Audit log | ${product}:product:`,
        loadComponent: () => import('./features/audit/audit-log').then((m) => m.AuditLogPage),
      },
      {
        path: 'admin/users',
        canActivate: [permissionGuard],
        data: { permission: TENANT_PERMISSIONS.usersView },
        title: $localize`:@@title.users:Company users | ${product}:product:`,
        loadComponent: () => import('./features/identity/users-admin').then((m) => m.UsersAdmin),
      },
      {
        path: 'projects',
        canActivate: [featureGuard],
        data: { permission: PROJECT_PERMISSIONS.view, feature: PROJECTS_FEATURE },
        title: $localize`:@@title.projects:Projects | ${product}:product:`,
        loadComponent: () =>
          import('./features/projects/projects-list').then((m) => m.ProjectsList),
      },
      {
        path: 'projects/new',
        canActivate: [featureGuard],
        data: { permission: PROJECT_PERMISSIONS.create, feature: PROJECTS_FEATURE },
        title: $localize`:@@title.newProject:New project | ${product}:product:`,
        loadComponent: () => import('./features/projects/project-form').then((m) => m.ProjectForm),
      },
      {
        path: 'projects/:id',
        canActivate: [featureGuard],
        data: { permission: PROJECT_PERMISSIONS.view, feature: PROJECTS_FEATURE },
        title: $localize`:@@title.project:Project | ${product}:product:`,
        loadComponent: () =>
          import('./features/projects/project-detail').then((m) => m.ProjectDetailPage),
      },
      {
        path: 'projects/:id/edit',
        canActivate: [featureGuard],
        data: { permission: PROJECT_PERMISSIONS.edit, feature: PROJECTS_FEATURE },
        title: $localize`:@@title.editProject:Edit project | ${product}:product:`,
        loadComponent: () => import('./features/projects/project-form').then((m) => m.ProjectForm),
      },
      {
        path: 'projects/:id/work-packages/new',
        canActivate: [featureGuard],
        data: { permission: PROJECT_PERMISSIONS.packagesCreate, feature: PROJECTS_FEATURE },
        title: $localize`:@@title.newPackage:New work package | ${product}:product:`,
        loadComponent: () =>
          import('./features/projects/work-package-form').then((m) => m.WorkPackageForm),
      },
      {
        path: 'work-packages/:packageId',
        canActivate: [featureGuard],
        data: { permission: PROJECT_PERMISSIONS.packagesView, feature: PROJECTS_FEATURE },
        title: $localize`:@@title.package:Work package | ${product}:product:`,
        loadComponent: () =>
          import('./features/projects/work-package-detail').then((m) => m.WorkPackageDetailPage),
      },
      {
        path: 'work-packages/:packageId/edit',
        canActivate: [featureGuard],
        data: { permission: PROJECT_PERMISSIONS.packagesEdit, feature: PROJECTS_FEATURE },
        title: $localize`:@@title.editPackage:Edit work package | ${product}:product:`,
        loadComponent: () =>
          import('./features/projects/work-package-form').then((m) => m.WorkPackageForm),
      },
      {
        path: 'subcontractors',
        canActivate: [featureGuard],
        data: { permission: DIRECTORY_PERMISSIONS.view, feature: DIRECTORY_FEATURE },
        title: $localize`:@@title.subcontractors:Subcontractors | ${product}:product:`,
        loadComponent: () =>
          import('./features/subcontractors/subcontractors-list').then((m) => m.SubcontractorsList),
      },
      {
        path: 'subcontractors/new',
        canActivate: [featureGuard],
        data: { permission: DIRECTORY_PERMISSIONS.create, feature: DIRECTORY_FEATURE },
        title: $localize`:@@title.newSubcontractor:Add subcontractor | ${product}:product:`,
        loadComponent: () =>
          import('./features/subcontractors/subcontractor-form').then((m) => m.SubcontractorForm),
      },
      {
        path: 'subcontractors/trades',
        canActivate: [featureGuard],
        data: { permission: DIRECTORY_PERMISSIONS.manageTrades, feature: DIRECTORY_FEATURE },
        title: $localize`:@@title.trades:Trades | ${product}:product:`,
        loadComponent: () =>
          import('./features/subcontractors/trades-admin').then((m) => m.TradesAdmin),
      },
      {
        // CF-056 (ADR-095): the company's compliance document types.
        path: 'subcontractors/compliance-types',
        canActivate: [featureGuard],
        data: { permission: 'Compliance.ManageTypes', feature: DIRECTORY_FEATURE },
        title: $localize`:@@title.complianceTypes:Compliance documents | ${product}:product:`,
        loadComponent: () =>
          import('./features/subcontractors/compliance-types').then((m) => m.ComplianceTypesPage),
      },
      {
        path: 'subcontractors/import',
        canActivate: [featureGuard],
        data: { permission: DIRECTORY_PERMISSIONS.import, feature: DIRECTORY_FEATURE },
        title: $localize`:@@title.importSubcontractors:Import subcontractors | ${product}:product:`,
        loadComponent: () =>
          import('./features/subcontractors/subcontractor-import').then(
            (m) => m.SubcontractorImportPage,
          ),
      },
      {
        path: 'subcontractors/:id',
        canActivate: [featureGuard],
        data: { permission: DIRECTORY_PERMISSIONS.view, feature: DIRECTORY_FEATURE },
        title: $localize`:@@title.subcontractor:Subcontractor | ${product}:product:`,
        loadComponent: () =>
          import('./features/subcontractors/subcontractor-detail').then(
            (m) => m.SubcontractorDetailPage,
          ),
      },
      {
        path: 'subcontractors/:id/edit',
        canActivate: [featureGuard],
        data: { permission: DIRECTORY_PERMISSIONS.edit, feature: DIRECTORY_FEATURE },
        title: $localize`:@@title.editSubcontractor:Edit subcontractor | ${product}:product:`,
        loadComponent: () =>
          import('./features/subcontractors/subcontractor-form').then((m) => m.SubcontractorForm),
      },
      {
        path: 'sourcing',
        canActivate: [featureGuard],
        data: { permission: SOURCING_PERMISSIONS.view, feature: SOURCING_FEATURES },
        title: $localize`:@@title.sourcing:Sourcing | ${product}:product:`,
        loadComponent: () =>
          import('./features/sourcing/sourcing-list').then((m) => m.SourcingList),
      },
      {
        path: 'sourcing/:id',
        canActivate: [featureGuard],
        data: { permission: SOURCING_PERMISSIONS.view, feature: SOURCING_FEATURES },
        title: $localize`:@@title.sourcingOne:Work package sourcing | ${product}:product:`,
        loadComponent: () =>
          import('./features/sourcing/sourcing-detail').then((m) => m.SourcingDetailPage),
      },
      {
        path: 'tenders',
        canActivate: [featureGuard],
        data: { permission: TENDER_PERMISSIONS.view, feature: TENDERING_FEATURES },
        title: $localize`:@@title.tenders:Tenders | ${product}:product:`,
        loadComponent: () => import('./features/tendering/tender-list').then((m) => m.TenderList),
      },
      {
        // CF-084 (ADR-098): the company's tender templates.
        path: 'tenders/templates',
        canActivate: [featureGuard],
        data: { permission: TENDER_PERMISSIONS.view, feature: TENDERING_FEATURES },
        title: $localize`:@@title.tenderTemplates:Tender templates | ${product}:product:`,
        loadComponent: () =>
          import('./features/tendering/tender-templates').then((m) => m.TenderTemplatesPage),
      },
      {
        path: 'tenders/:id',
        canActivate: [featureGuard],
        data: { permission: TENDER_PERMISSIONS.view, feature: TENDERING_FEATURES },
        title: $localize`:@@title.tender:Tender | ${product}:product:`,
        loadComponent: () => import('./features/tendering/tender-page').then((m) => m.TenderPage),
      },
      {
        path: 'tenders/:id/evaluation',
        canActivate: [featureGuard],
        data: { permission: EVALUATION_PERMISSIONS.view, feature: EVALUATION_FEATURES },
        title: $localize`:@@title.evaluation:Bid evaluation | ${product}:product:`,
        loadComponent: () =>
          import('./features/evaluation/evaluation-page').then((m) => m.EvaluationPage),
      },
      {
        path: 'tenders/:id/negotiation',
        canActivate: [featureGuard],
        data: { permission: EVALUATION_PERMISSIONS.view, feature: AWARD_FEATURES },
        title: $localize`:@@title.negotiation:Negotiation rounds | ${product}:product:`,
        loadComponent: () =>
          import('./features/decision/negotiation-page').then((m) => m.NegotiationPage),
      },
      {
        path: 'tenders/:id/negotiation/comparison',
        canActivate: [featureGuard],
        data: { permission: EVALUATION_PERMISSIONS.view, feature: AWARD_FEATURES },
        title: $localize`:@@title.comparison:Revision comparison | ${product}:product:`,
        loadComponent: () =>
          import('./features/decision/negotiation-comparison').then((m) => m.NegotiationComparison),
      },
      {
        path: 'tenders/:id/decision',
        canActivate: [featureGuard],
        data: { permission: DECISION_PERMISSIONS.view, feature: AWARD_FEATURES },
        title: $localize`:@@title.decision:Recommendation and decision | ${product}:product:`,
        loadComponent: () =>
          import('./features/decision/decision-page').then((m) => m.DecisionPage),
      },
      {
        // CF-003 (ADR-109): the printable decision / award pack.
        path: 'tenders/:id/decision/print',
        canActivate: [featureGuard],
        data: { permission: DECISION_PERMISSIONS.view, feature: AWARD_FEATURES },
        title: $localize`:@@title.decisionPack:Decision and award pack | ${product}:product:`,
        loadComponent: () =>
          import('./features/decision/decision-pack').then((m) => m.DecisionPackPage),
      },
      {
        path: 'recommendation-policies',
        canActivate: [featureGuard],
        // CF-133: anyone who may read the policies (Decision.View) sees them; only managers change them.
        data: {
          permission: [DECISION_PERMISSIONS.managePolicy, DECISION_PERMISSIONS.view],
          feature: AWARD_FEATURES,
        },
        title: $localize`:@@title.recommendationPolicies:Recommendation policies | ${product}:product:`,
        loadComponent: () =>
          import('./features/decision/recommendation-policies').then(
            (m) => m.RecommendationPolicies,
          ),
      },
      {
        path: 'approval-matrix',
        canActivate: [featureGuard],
        data: { permission: DECISION_PERMISSIONS.manageMatrix, feature: AWARD_FEATURES },
        title: $localize`:@@title.approvalMatrix:Approval matrix | ${product}:product:`,
        loadComponent: () =>
          import('./features/decision/approval-matrix').then((m) => m.ApprovalMatrixPage),
      },
      {
        // CF-136: approvers and submitters read the matrix that routes their work.
        path: 'approval-matrix/read',
        canActivate: [featureGuard],
        data: {
          permission: [
            DECISION_PERMISSIONS.manageMatrix,
            DECISION_PERMISSIONS.approve,
            DECISION_PERMISSIONS.submit,
          ],
          feature: AWARD_FEATURES,
        },
        title: $localize`:@@title.approvalMatrixRead:Approval routes | ${product}:product:`,
        loadComponent: () =>
          import('./features/decision/approval-matrix-read').then((m) => m.ApprovalMatrixRead),
      },
      {
        path: 'closeouts',
        canActivate: [featureGuard],
        data: { permission: PERFORMANCE_PERMISSIONS.view, feature: PERFORMANCE_FEATURES },
        title: $localize`:@@title.closeouts:Closeouts | ${product}:product:`,
        loadComponent: () =>
          import('./features/performance/closeouts-list').then((m) => m.CloseoutsList),
      },
      {
        path: 'retrospective-outcomes',
        canActivate: [featureGuard],
        data: { permission: PERFORMANCE_PERMISSIONS.view, feature: PERFORMANCE_FEATURES },
        title: $localize`:@@title.retrospective:Past outcomes | ${product}:product:`,
        loadComponent: () =>
          import('./features/performance/retrospective-list').then((m) => m.RetrospectiveList),
      },
      {
        path: 'retrospective-outcomes/import',
        canActivate: [featureGuard],
        data: { permission: PERFORMANCE_PERMISSIONS.editCommercial, feature: PERFORMANCE_FEATURES },
        title: $localize`:@@title.retrospectiveImport:Import past outcomes | ${product}:product:`,
        loadComponent: () =>
          import('./features/performance/retrospective-import').then((m) => m.RetrospectiveImport),
      },
      {
        path: 'retrospective-outcomes/:id',
        canActivate: [featureGuard],
        data: { permission: PERFORMANCE_PERMISSIONS.view, feature: PERFORMANCE_FEATURES },
        title: $localize`:@@title.retrospectiveOne:Past outcome | ${product}:product:`,
        loadComponent: () =>
          import('./features/performance/retrospective-page').then((m) => m.RetrospectivePage),
      },
      {
        path: 'closeouts/:awardId',
        canActivate: [featureGuard],
        data: { permission: PERFORMANCE_PERMISSIONS.view, feature: PERFORMANCE_FEATURES },
        title: $localize`:@@title.closeout:Performance closeout | ${product}:product:`,
        loadComponent: () =>
          import('./features/performance/closeout-page').then((m) => m.CloseoutPage),
      },
      {
        path: 'evaluation-policies',
        canActivate: [featureGuard],
        // CF-133: anyone who may read the policies (Evaluation.View) sees them; only managers change them.
        data: {
          permission: [EVALUATION_PERMISSIONS.managePolicy, EVALUATION_PERMISSIONS.view],
          feature: EVALUATION_FEATURES,
        },
        title: $localize`:@@title.evaluationPolicies:Scorecard policies | ${product}:product:`,
        loadComponent: () =>
          import('./features/evaluation/evaluation-policies').then((m) => m.EvaluationPolicies),
      },
      {
        path: 'admin/email',
        canActivate: [permissionGuard],
        data: { permission: COMPANY_EMAIL_PERMISSION },
        title: $localize`:@@title.companyEmail:Email delivery | ${product}:product:`,
        loadComponent: () =>
          import('./features/email/company-email').then((m) => m.CompanyEmailPage),
      },
      {
        path: 'admin/company',
        canActivate: [permissionGuard],
        data: { permission: COMPANY_PROFILE_PERMISSION },
        title: $localize`:@@title.companySettings:Company settings | ${product}:product:`,
        loadComponent: () =>
          import('./features/company/company-settings').then((m) => m.CompanySettingsPage),
      },
      {
        path: '',
        pathMatch: 'full',
        title: $localize`:@@title.workspace:Workspace | ${product}:product:`,
        loadComponent: () => import('./features/overview/overview').then((m) => m.Overview),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
