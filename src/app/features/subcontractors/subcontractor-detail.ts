import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { countryName, placeName } from '../../core/localization/countries';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { PERFORMANCE_FEATURES, PERFORMANCE_PERMISSIONS } from '../performance/performance.api';
import { SubcontractorPerformanceView } from '../performance/subcontractor-performance';
import {
  INTELLIGENCE_FEATURES,
  INTELLIGENCE_PERMISSIONS,
  SubcontractorIntelligence,
} from '../intelligence/intelligence.api';
import { IntelSummary } from '../intelligence/intel-summary';
import { SubcontractorIntelligenceView } from '../intelligence/subcontractor-intelligence';
import { SubcontractorComplianceView } from './subcontractor-compliance';
import { decisionStatusLabel } from '../decision/decision-labels';
import { DecisionStatus } from '../decision/decision.api';
import {
  DIRECTORY_PERMISSIONS,
  DirectoryApi,
  SubcontractorDetail,
  SubcontractorEngagements,
  SubcontractorStatus,
  directoryProblemMessage,
  statusLabel,
} from './subcontractors.api';

/** A lifecycle move as the user sees it: what it is called and what it means. */
interface StatusAction {
  readonly to: SubcontractorStatus;
  readonly label: string;
  readonly heading: string;
  readonly consequence: string;
  readonly reason: 'required' | 'optional' | 'none';
  readonly danger: boolean;
  /** CF-102 (ADR-156 §2): the forward move (Activate) is primary; a pause or lifting a block is secondary (ghost); Block is danger. */
  readonly kind: 'forward' | 'secondary' | 'danger';
}

@Component({
  selector: 'app-subcontractor-detail',
  imports: [
    FormsModule,
    RouterLink,
    BusinessDatePipe,
    ConfirmDialog,
    SubcontractorPerformanceView,
    SubcontractorIntelligenceView,
    IntelSummary,
    SubcontractorComplianceView,
  ],
  templateUrl: './subcontractor-detail.html',
})
export class SubcontractorDetailPage implements OnInit {
  private readonly api = inject(DirectoryApi);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  private readonly entitlements = inject(EntitlementsService);

  readonly permissions = DIRECTORY_PERMISSIONS;
  readonly statusLabel = statusLabel;
  readonly countryName = countryName;
  readonly subcontractor = signal<SubcontractorDetail | null>(null);
  readonly loading = signal(true);
  /** CF-014: the intelligence profile as last loaded below, summarized above the fold. */
  readonly summary = signal<SubcontractorIntelligence | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly pending = signal<StatusAction | null>(null);
  readonly reasonMissing = signal(false);
  /**
   * Red-team G044 (CF-044 AC6): before a block is confirmed, the firm's open invitations and the decisions proposing it — so whoever
   * blocks knows what it stops. null while loading; the dialog still allows the block when they cannot be read.
   */
  readonly engagements = signal<SubcontractorEngagements | null>(null);
  readonly engagementsFailed = signal(false);
  reason = '';
  /** Part 12: the next project's work package, when the profile was opened from its sourcing (similar-project evidence). */
  workPackageId: string | null = null;
  /** CF-026: the category a work package or decision opened the profile in. */
  category: string | null = null;
  private id = '';

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.workPackageId = this.route.snapshot.queryParamMap?.get('workPackage') ?? null;
    this.category = this.route.snapshot.queryParamMap?.get('category') ?? null;
    this.load();
  }

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  /** Part 11: the firm's private project-performance history, for people who read closeouts. */
  showPerformance(): boolean {
    return (
      this.can(PERFORMANCE_PERMISSIONS.view) &&
      PERFORMANCE_FEATURES.every((feature) => this.entitlements.has(feature))
    );
  }

  /** Part 12: the intelligence profile — general evidence for every internal role, the rest decided by the server per field class. */
  showIntelligence(): boolean {
    return (
      this.can(INTELLIGENCE_PERMISSIONS.view) &&
      INTELLIGENCE_FEATURES.every((feature) => this.entitlements.has(feature))
    );
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get(this.id).subscribe({
      next: (subcontractor) => {
        this.subcontractor.set(subcontractor);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(directoryProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  /** The moves this person may make from the current status. Blocking and lifting a block need Block. */
  actions(subcontractor: SubcontractorDetail): StatusAction[] {
    return subcontractor.allowedNextStatuses
      .filter((to) =>
        to === 'Blocked' || subcontractor.status === 'Blocked'
          ? this.can(this.permissions.block)
          : this.can(this.permissions.changeStatus),
      )
      .map((to) => this.describe(subcontractor.status, to));
  }

  /** CF-071 (ADR-134): erasure of a contact's personal data on request — Company Admin, two steps. */
  readonly erasingContact = signal<string | null>(null);

  canManageData(): boolean {
    return this.can('Company.ManageData');
  }

  eraseContact(contactId: string): void {
    const subcontractor = this.subcontractor();
    if (!subcontractor || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.eraseContact(subcontractor.id, contactId, subcontractor.version).subscribe({
      next: (updated) => {
        this.subcontractor.set(updated);
        this.erasingContact.set(null);
        this.busy.set(false);
        this.notice.set(
          $localize`:@@directory.contactErased:The contact's name, job title, email and phone were erased.`,
        );
      },
      error: (error: unknown) => {
        this.error.set(directoryProblemMessage(error));
        this.busy.set(false);
        this.erasingContact.set(null);
      },
    });
  }

  ask(action: StatusAction): void {
    this.notice.set('');
    this.error.set('');
    this.reason = '';
    this.reasonMissing.set(false);
    this.pending.set(action);
    this.engagements.set(null);
    this.engagementsFailed.set(false);
    const subcontractor = this.subcontractor();
    if (action.to === 'Blocked' && subcontractor) this.loadEngagements(subcontractor.id);
  }

  loadEngagements(id: string): void {
    this.engagementsFailed.set(false);
    this.api.engagements(id).subscribe({
      next: (engagements) => this.engagements.set(engagements),
      error: () => this.engagementsFailed.set(true),
    });
  }

  decisionStateLabel(state: string | null): string {
    return decisionStatusLabel(state as DecisionStatus | null);
  }

  dismiss(): void {
    this.pending.set(null);
  }

  confirm(): void {
    const subcontractor = this.subcontractor();
    const action = this.pending();
    if (!subcontractor || !action || this.busy()) return;
    const reason = this.reason.trim();
    if (action.reason === 'required' && reason.length < 3) {
      this.reasonMissing.set(true);
      return;
    }
    this.busy.set(true);
    this.api
      .changeStatus(
        subcontractor.id,
        action.to,
        action.reason === 'none' ? null : reason || null,
        subcontractor.version,
      )
      .subscribe({
        next: (updated) => {
          this.subcontractor.set(updated);
          this.notice.set(
            $localize`:@@directory.moved:Subcontractor moved to ${this.statusLabel(updated.status)}:status:.`,
          );
          this.busy.set(false);
          this.pending.set(null);
        },
        error: (error: unknown) => {
          this.error.set(directoryProblemMessage(error));
          this.busy.set(false);
          this.pending.set(null);
        },
      });
  }

  location(subcontractor: SubcontractorDetail): string {
    return placeName(subcontractor.city, subcontractor.countryCode);
  }

  private describe(from: SubcontractorStatus, to: SubcontractorStatus): StatusAction {
    if (to === 'Blocked')
      return {
        to,
        label: $localize`:@@directory.block:Block`,
        heading: $localize`:@@directory.blockTitle:Block this subcontractor?`,
        consequence: $localize`:@@directory.blockConsequence:A blocked subcontractor stays in the directory, clearly marked, so nobody adds it again. Record why; the reason stays on the record while it is blocked.`,
        reason: 'required',
        danger: true,
        kind: 'danger',
      };
    if (from === 'Blocked')
      return {
        to,
        label: $localize`:@@directory.unblock:Lift block`,
        heading: $localize`:@@directory.unblockTitle:Lift this block?`,
        consequence: $localize`:@@directory.unblockConsequence:The subcontractor becomes Inactive. Reactivating it is a separate decision.`,
        reason: 'optional',
        danger: false,
        kind: 'secondary',
      };
    if (to === 'Inactive')
      return {
        to,
        label: $localize`:@@directory.deactivate:Deactivate`,
        heading: $localize`:@@directory.deactivateTitle:Deactivate this subcontractor?`,
        consequence: $localize`:@@directory.deactivateConsequence:The record and its history are kept. It still counts toward your plan's subcontractor limit.`,
        reason: 'optional',
        danger: false,
        kind: 'secondary',
      };
    return {
      to,
      label: $localize`:@@directory.activate:Activate`,
      heading: $localize`:@@directory.activateTitle:Activate this subcontractor?`,
      consequence: $localize`:@@directory.activateConsequence:The subcontractor becomes available for your work again. This uses no additional plan capacity.`,
      reason: 'none',
      danger: false,
      kind: 'forward',
    };
  }
}
