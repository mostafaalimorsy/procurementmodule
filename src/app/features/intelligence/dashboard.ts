import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { tenantRoleLabel } from '../../core/auth/tenant-role-labels';
import { MyWorkPanel } from './my-work';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { tenderStatusLabel } from '../../core/localization/labels';
import { categoryLabel, scheduleOutcomeLabel } from '../performance/performance-labels';
import { EvidenceStrengthBadge } from './evidence-strength';
import {
  Dashboard,
  DashboardItem,
  IntelligenceApi,
  intelligenceProblemMessage,
} from './intelligence.api';

/**
 * The Home dashboard (Part 12, ADR-079): what needs attention, what procurement is active, which closeouts are missing and where the
 * company's own evidence is strong or thin. Each section exists only when the server included it for this person and plan, so no count
 * appears for records the reader cannot open; every count and item links to the work behind it. No revenue, savings or trend is claimed.
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, BusinessDatePipe, EvidenceStrengthBadge, MyWorkPanel],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardView implements OnInit {
  private readonly api = inject(IntelligenceApi);
  readonly dashboard = signal<Dashboard | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly categoryLabel = categoryLabel;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.dashboard().subscribe({
      next: (dashboard) => {
        this.dashboard.set(dashboard);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(intelligenceProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  attention(view: Dashboard): DashboardItem[] {
    return [
      ...(view.decisions?.items ?? []),
      ...(view.evaluation?.items ?? []),
      ...(view.tenders?.items ?? []),
    ];
  }

  link(item: DashboardItem): unknown[] {
    switch (item.kind) {
      case 'evaluation.pending':
      case 'evaluation.completed':
        return ['/tenders', item.tenderId, 'evaluation'];
      case 'tender.awaiting_opening':
        return this.dashboard()?.evaluation
          ? ['/tenders', item.tenderId, 'evaluation']
          : ['/tenders', item.tenderId];
      case 'evaluation.ready':
      case 'decision.awaiting_approval':
      case 'decision.awaiting_your_approval':
      case 'decision.awaiting_approval_by':
      case 'decision.approved':
      case 'award.issued':
        return ['/tenders', item.tenderId, 'decision'];
      case 'closeout.closed':
        return ['/closeouts', item.id];
      default:
        return ['/tenders', item.tenderId];
    }
  }

  /**
   * Decisions and evaluations link to their workspace only for readers the server gave that section to; a tender awaiting opening opens the
   * evaluation page only for evaluation readers (others open the tender).
   */
  linkable(view: Dashboard, item: DashboardItem): boolean {
    if (item.kind === 'evaluation.ready') return view.decisions !== null;
    return true;
  }

  kindLabel(item: DashboardItem): string {
    switch (item.kind) {
      case 'decision.awaiting_approval':
        return $localize`:@@dashboard.kindApproval:Decision awaiting approval`;
      // CF-129: yours to approve now, or whose step it is.
      case 'decision.awaiting_your_approval':
        return $localize`:@@dashboard.kindYourApproval:Decision awaiting your approval`;
      case 'decision.awaiting_approval_by': {
        const [step, role] = (item.detail ?? '').split(':');
        const who = role ? tenantRoleLabel(role) : $localize`:@@dashboard.anyApprover:any approver`;
        return $localize`:@@dashboard.kindApprovalBy:Decision awaiting approval — step ${step}:step: (${who}:role:)`;
      }
      case 'decision.approved':
        return $localize`:@@dashboard.kindApproved:Approved — award to issue`;
      case 'evaluation.pending':
        // CF-007: the decision workspace's reason a completed evaluation is not ready yet.
        switch (item.status) {
          case 'NotStarted':
            return $localize`:@@dashboard.kindEvaluationNotStarted:Bids opened — evaluation not started`;
          case 'NegotiationOpen':
            return $localize`:@@dashboard.kindNegotiationOpen:Negotiation round open — the decision waits for it to close`;
          case 'RefreshRequired':
            return $localize`:@@dashboard.kindRefreshRequired:Round closed — take it into the evaluation before the decision`;
          default:
            return $localize`:@@dashboard.kindEvaluation:Evaluation in progress`;
        }
      case 'evaluation.ready':
        return $localize`:@@dashboard.kindReady:Evaluation complete — ready for a decision`;
      case 'evaluation.completed':
        return $localize`:@@dashboard.kindEvaluationFinal:Evaluation complete — the last stage in your plan`;
      case 'tender.awaiting_opening':
        return $localize`:@@dashboard.kindOpening:Bidding closed — bids to open`;
      case 'tender.closing':
        return $localize`:@@dashboard.kindClosing:Bidding closes soon`;
      default:
        return item.status ? tenderStatusLabel(item.status) : '';
    }
  }

  scheduleLabel(status: string | null): string {
    return scheduleOutcomeLabel(status);
  }
}
