import { ComplianceChips } from '../subcontractors/compliance-chips';
import { vendorStatusLabel } from '../subcontractors/compliance.api';
import { DOCUMENT } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { placeName } from '../../core/localization/countries';
import {
  lifecycleStatusLabel,
  ltr,
  subcontractorStatusLabel,
} from '../../core/localization/labels';
import { knownProductProblem } from '../../core/localization/product-problem';
import { CandidateEvidenceView } from '../intelligence/candidate-evidence';
import { DiscoveryHistoryChip } from '../intelligence/history-chips';
import {
  PrequalificationEvidenceLive,
  PrequalificationEvidenceRecord,
} from './prequalification-evidence';
import { INTELLIGENCE_FEATURES, INTELLIGENCE_PERMISSIONS } from '../intelligence/intelligence.api';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { WorkPackageTender } from '../tendering/work-package-tender';
import { DirectoryApi, Paged, Trade } from '../subcontractors/subcontractors.api';
import {
  CRITERIA,
  CRITERION_OUTCOMES,
  CriterionKey,
  CriterionOutcome,
  Assessment,
  Criteria,
  DiscoveryItem,
  PREQUALIFICATION_RESULTS,
  PrequalificationResult,
  RATIONALE_MAX,
  REASON_MAX,
  REASON_MIN,
  SOURCING_PERMISSIONS,
  SourcingApi,
  SourcingCandidate,
  SourcingDetail,
  criterionLabel,
  criterionOutcomeLabel,
  isStale,
  prequalificationResultLabel,
  rationaleRequired,
  sourcingProblemMessage,
  sourcingStatusLabel,
  summarizeCriteria,
} from './sourcing.api';

type Dialog =
  | {
      readonly kind: 'assess';
      readonly candidate: SourcingCandidate;
      /** CF-057: further candidates given the same prequalification. */
      readonly others?: readonly SourcingCandidate[];
    }
  | { readonly kind: 'fastPath'; readonly firms: readonly DiscoveryItem[] }
  | { readonly kind: 'remove'; readonly candidate: SourcingCandidate }
  | { readonly kind: 'approve' }
  | { readonly kind: 'reopen' }
  | { readonly kind: 'trades' };

/**
 * The sourcing of one work package: who is considered, how each was prequalified, the shortlist and
 * its approvals. The page never offers an action the server would refuse for the current state or the
 * person's permissions, and it says why a step is unavailable instead of hiding the rule.
 */
@Component({
  selector: 'app-sourcing-detail',
  imports: [
    ComplianceChips,
    FormsModule,
    RouterLink,
    BusinessDatePipe,
    ConfirmDialog,
    WorkPackageTender,
    CandidateEvidenceView,
    PrequalificationEvidenceLive,
    PrequalificationEvidenceRecord,
    DiscoveryHistoryChip,
  ],
  templateUrl: './sourcing-detail.html',
  styleUrl: './sourcing-detail.scss',
})
export class SourcingDetailPage implements OnInit {
  private readonly api = inject(SourcingApi);
  private readonly directory = inject(DirectoryApi);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  private readonly entitlements = inject(EntitlementsService);
  private readonly document = inject(DOCUMENT);

  readonly permissions = SOURCING_PERMISSIONS;
  readonly criteria = CRITERIA;
  readonly outcomes = CRITERION_OUTCOMES;
  readonly results = PREQUALIFICATION_RESULTS;
  readonly rationaleMax = RATIONALE_MAX;
  readonly reasonMax = REASON_MAX;
  readonly reasonMin = REASON_MIN;
  readonly statusLabel = sourcingStatusLabel;
  readonly packageStatusLabel = lifecycleStatusLabel;
  readonly directoryStatusLabel = subcontractorStatusLabel;
  readonly vendorLabel = vendorStatusLabel;
  readonly resultLabel = prequalificationResultLabel;
  readonly criterionLabel = criterionLabel;
  readonly outcomeLabel = criterionOutcomeLabel;
  readonly summarize = summarizeCriteria;

  readonly sourcing = signal<SourcingDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly dialog = signal<Dialog | null>(null);
  /** CF-057: directory firms ticked for a bulk add or the fast path, and candidates ticked for one prequalification. */
  readonly picked = signal<ReadonlyMap<string, DiscoveryItem>>(new Map());
  readonly pickedCandidates = signal<ReadonlySet<string>>(new Set());
  fastPathRationale = '';
  readonly dialogError = signal('');
  readonly trades = signal<readonly Trade[]>([]);

  readonly discovery = signal<Paged<DiscoveryItem> | null>(null);
  readonly discoveryLoading = signal(false);
  readonly discoveryError = signal('');
  discoverSearch = '';
  discoverTradeId = '';
  showUnavailable = false;
  discoverPage = 1;

  // Assessment form.
  assessResult: PrequalificationResult = 'Pending';
  assessCriteria: Record<CriterionKey, CriterionOutcome> = { ...emptyCriteria() };
  assessRationale = '';
  readonly rationaleMissing = signal(false);
  // Reopen form.
  reopenReason = '';
  readonly reasonMissing = signal(false);
  // Trades editor.
  selectedTrades = new Set<string>();

  private id = '';

  readonly editable = computed(() => this.sourcing()?.lockReason === null);
  readonly active = computed(() => this.sourcing()?.candidates.filter((c) => !c.isRemoved) ?? []);
  /** Part 12: the candidates' own history in this package's category, for people who read intelligence. */
  readonly evidenceCandidates = computed(() =>
    this.active().map((candidate) => ({
      subcontractorId: candidate.subcontractorId,
      code: candidate.code,
      legalName: candidate.legalName,
    })),
  );
  readonly removed = computed(() => this.sourcing()?.candidates.filter((c) => c.isRemoved) ?? []);
  readonly counts = computed(() => {
    const active = this.active();
    return {
      candidates: active.length,
      qualified: active.filter((c) => c.result === 'Qualified').length,
      shortlisted: active.filter((c) => c.isShortlisted).length,
    };
  });
  readonly lockMessage = computed(() => {
    const reason = this.sourcing()?.lockReason;
    return reason ? (knownProductProblem({ code: reason }) ?? '') : '';
  });
  readonly pastApprovals = computed(
    () => this.sourcing()?.approvals.filter((approval) => approval.revokedAtUtc !== null) ?? [],
  );

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.directory
      .trades()
      .subscribe({ next: (trades) => this.trades.set(trades), error: () => this.trades.set([]) });
    this.load();
  }

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  showEvidence(): boolean {
    return (
      this.can(INTELLIGENCE_PERMISSIONS.view) &&
      INTELLIGENCE_FEATURES.every((feature) => this.entitlements.has(feature))
    );
  }

  load(afterNotice = ''): void {
    this.loading.set(this.sourcing() === null);
    this.error.set('');
    this.api.get(this.id).subscribe({
      next: (sourcing) => {
        this.sourcing.set(sourcing);
        this.loading.set(false);
        if (afterNotice) this.notice.set(afterNotice);
        if (this.canAddCandidates()) this.discover();
      },
      error: (error: unknown) => {
        this.error.set(sourcingProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  /** What the person should do next, stated in business terms. */
  guidance(sourcing: SourcingDetail): string {
    // CF-007: tendering is the next stage only on a plan that includes it.
    const tendering = this.entitlements.has('tendering');
    if (sourcing.lockReason === 'sourcing.shortlist_approved_read_only')
      return tendering
        ? $localize`:@@sourcing.guidanceApproved:This shortlist is approved. These subcontractors may proceed to tendering; nothing here changes unless the shortlist is reopened.`
        : $localize`:@@sourcing.guidanceApprovedLastStage:This shortlist is approved and stays as the record of who qualified: tendering is not in your plan. Nothing here changes unless the shortlist is reopened.`;
    if (sourcing.lockReason) return this.lockMessage();
    const { candidates, qualified, shortlisted } = this.counts();
    if (candidates === 0)
      return $localize`:@@sourcing.guidanceEmpty:Start by adding candidates from your subcontractor directory.`;
    if (qualified === 0)
      return $localize`:@@sourcing.guidanceAssess:Prequalify the candidates: record each criterion and decide whether the candidate qualifies.`;
    if (shortlisted === 0)
      return $localize`:@@sourcing.guidanceShortlist:Put the qualified candidates who should proceed on the shortlist.`;
    if (this.active().some((c) => c.isShortlisted && c.directoryStatus !== 'Active'))
      return $localize`:@@sourcing.guidanceInactiveMember:A shortlisted subcontractor is no longer active in the directory. Take it off the shortlist before the shortlist can be approved.`;
    return this.can(this.permissions.approve)
      ? tendering
        ? $localize`:@@sourcing.guidanceReadyApprover:The shortlist is ready. Review it and approve it so these subcontractors can proceed to tendering.`
        : $localize`:@@sourcing.guidanceReadyApproverLastStage:The shortlist is ready. Review it and approve it as the record of who qualified.`
      : $localize`:@@sourcing.guidanceReady:The shortlist is ready for approval by a Procurement Manager.`;
  }

  canAddCandidates(): boolean {
    return this.editable() && this.can(this.permissions.manage);
  }

  canAssess(candidate: SourcingCandidate): boolean {
    return this.editable() && this.can(this.permissions.prequalify) && !candidate.isRemoved;
  }

  canShortlist(candidate: SourcingCandidate): boolean {
    return (
      this.editable() &&
      this.can(this.permissions.manage) &&
      !candidate.isRemoved &&
      !candidate.isShortlisted &&
      candidate.result === 'Qualified' &&
      candidate.directoryStatus === 'Active'
    );
  }

  canUnshortlist(candidate: SourcingCandidate): boolean {
    return this.editable() && this.can(this.permissions.manage) && candidate.isShortlisted;
  }

  canRemove(candidate: SourcingCandidate): boolean {
    return this.editable() && this.can(this.permissions.manage) && !candidate.isRemoved;
  }

  canRestore(candidate: SourcingCandidate): boolean {
    return (
      this.editable() &&
      this.can(this.permissions.manage) &&
      candidate.isRemoved &&
      candidate.directoryStatus === 'Active'
    );
  }

  /** Why a candidate cannot go on the shortlist, when shortlisting is otherwise possible. */
  shortlistBlocker(candidate: SourcingCandidate): string {
    if (!this.editable()) return '';
    // A firm blocked or deactivated after shortlisting stops the approval until it is taken off.
    if (candidate.isShortlisted && candidate.directoryStatus !== 'Active')
      return $localize`:@@sourcing.blockerShortlisted:No longer active in the directory. Take it off the shortlist before the shortlist can be approved.`;
    if (!this.can(this.permissions.manage) || candidate.isShortlisted) return '';
    if (candidate.directoryStatus !== 'Active')
      return $localize`:@@sourcing.blockerDirectory:${this.directoryStatusLabel(candidate.directoryStatus)}:status: in the directory, so it cannot be qualified or shortlisted.`;
    if (candidate.result !== 'Qualified')
      return $localize`:@@sourcing.blockerQualify:Qualify this candidate before it can be shortlisted.`;
    return '';
  }

  location(item: { city: string | null; countryCode: string | null }): string {
    return placeName(item.city, item.countryCode);
  }

  // ---------------------------------------------------------------- discovery

  discover(page = 1): void {
    const sourcing = this.sourcing();
    if (!sourcing) return;
    this.discoverPage = page;
    this.discoveryLoading.set(true);
    this.discoveryError.set('');
    this.api
      .discover(sourcing.id, {
        search: this.discoverSearch,
        tradeId: this.discoverTradeId || null,
        status: this.showUnavailable ? [] : ['Active'],
        page,
        pageSize: 10,
      })
      .subscribe({
        next: (result) => {
          this.discovery.set(result);
          this.discoveryLoading.set(false);
        },
        error: (error: unknown) => {
          this.discoveryError.set(sourcingProblemMessage(error));
          this.discoveryLoading.set(false);
        },
      });
  }

  /** Why a directory firm cannot be added, or null when it can. */
  discoveryBlocker(item: DiscoveryItem): string | null {
    if (item.candidateState === 'candidate')
      return $localize`:@@sourcing.alreadyCandidate:Already a candidate`;
    if (item.directoryStatus !== 'Active')
      return $localize`:@@sourcing.notActiveInDirectory:${this.directoryStatusLabel(item.directoryStatus)}:status: in the directory — cannot be considered`;
    return null;
  }

  add(item: DiscoveryItem): void {
    const sourcing = this.sourcing();
    if (!sourcing) return;
    this.mutate(
      this.api.addCandidate(sourcing.id, item.subcontractorId, sourcing.version),
      item.candidateState === 'removed'
        ? $localize`:@@sourcing.restoredNotice:${ltr(item.code)}:code: is being considered again.`
        : $localize`:@@sourcing.addedNotice:${ltr(item.code)}:code: added as a candidate.`,
    );
  }

  isPicked(item: DiscoveryItem): boolean {
    return this.picked().has(item.subcontractorId);
  }

  togglePick(item: DiscoveryItem, selected: boolean): void {
    const next = new Map(this.picked());
    if (selected) next.set(item.subcontractorId, item);
    else next.delete(item.subcontractorId);
    this.picked.set(next);
  }

  /** CF-057: all ticked firms in one request — all or none. */
  addPicked(): void {
    const sourcing = this.sourcing();
    const firms = [...this.picked().values()];
    if (!sourcing || !firms.length) return;
    this.mutate(
      this.api.addCandidates(
        sourcing.id,
        firms.map((firm) => firm.subcontractorId),
        sourcing.version,
      ),
      $localize`:@@sourcing.addedManyNotice:${firms.length}:count: candidates added.`,
    );
  }

  /** CF-057 (OD-10): offered when the company enabled it, four eyes are off and the package is within the limit. */
  canFastPath(): boolean {
    const sourcing = this.sourcing();
    return (
      !!sourcing &&
      sourcing.fastPathUnavailable === null &&
      this.canAddCandidates() &&
      this.can(this.permissions.prequalify) &&
      this.can(this.permissions.approve)
    );
  }

  openFastPath(): void {
    this.fastPathRationale = '';
    this.reasonMissing.set(false);
    this.open({ kind: 'fastPath', firms: [...this.picked().values()] });
  }

  isCandidatePicked(candidate: SourcingCandidate): boolean {
    return this.pickedCandidates().has(candidate.id);
  }

  toggleCandidate(candidate: SourcingCandidate, selected: boolean): void {
    const next = new Set(this.pickedCandidates());
    if (selected) next.add(candidate.id);
    else next.delete(candidate.id);
    this.pickedCandidates.set(next);
  }

  /** Bulk prequalification covers only active firms, so Qualified is always on offer. */
  canBulkAssess(candidate: SourcingCandidate): boolean {
    return this.canAssess(candidate) && candidate.directoryStatus === 'Active';
  }

  openAssessPicked(): void {
    const chosen = this.active().filter(
      (candidate) => this.isCandidatePicked(candidate) && this.canBulkAssess(candidate),
    );
    if (!chosen.length) return;
    this.openAssess(chosen[0]);
    this.assessResult = 'Pending';
    this.assessCriteria = { ...emptyCriteria() };
    this.assessRationale = '';
    this.dialog.set({ kind: 'assess', candidate: chosen[0], others: chosen.slice(1) });
  }

  restore(candidate: SourcingCandidate): void {
    const sourcing = this.sourcing();
    if (!sourcing) return;
    this.mutate(
      this.api.addCandidate(sourcing.id, candidate.subcontractorId, sourcing.version),
      $localize`:@@sourcing.restoredNotice:${ltr(candidate.code)}:code: is being considered again.`,
    );
  }

  // ---------------------------------------------------------------- shortlist

  setShortlisted(candidate: SourcingCandidate, shortlisted: boolean): void {
    const sourcing = this.sourcing();
    if (!sourcing) return;
    this.mutate(
      this.api.shortlist(sourcing.id, candidate.id, shortlisted, sourcing.version),
      shortlisted
        ? $localize`:@@sourcing.shortlistedNotice:${ltr(candidate.code)}:code: is on the shortlist.`
        : $localize`:@@sourcing.unshortlistedNotice:${ltr(candidate.code)}:code: is off the shortlist.`,
    );
  }

  // ---------------------------------------------------------------- dialogs

  openAssess(candidate: SourcingCandidate): void {
    // A firm no longer Active cannot stay Qualified; the form starts undecided and says why.
    this.assessResult =
      candidate.result === 'Qualified' && candidate.directoryStatus !== 'Active'
        ? 'Pending'
        : candidate.result;
    this.assessCriteria = { ...candidate.criteria };
    this.assessRationale = candidate.rationale ?? '';
    this.rationaleMissing.set(false);
    this.open({ kind: 'assess', candidate });
  }

  needsRationale(): boolean {
    return rationaleRequired(this.assessResult, this.assessCriteria);
  }

  openTrades(): void {
    this.selectedTrades = new Set(this.sourcing()?.trades.map((trade) => trade.id) ?? []);
    this.open({ kind: 'trades' });
  }

  /** Active trades may be added; a retired trade stays only if the sourcing already names it. */
  tradeChoices(): readonly Trade[] {
    const named = new Set(this.sourcing()?.trades.map((trade) => trade.id) ?? []);
    return this.trades().filter((trade) => trade.isActive || named.has(trade.id));
  }

  toggleTrade(tradeId: string, selected: boolean): void {
    const next = new Set(this.selectedTrades);
    if (selected) next.add(tradeId);
    else next.delete(tradeId);
    this.selectedTrades = next;
  }

  openReopen(): void {
    this.reopenReason = '';
    this.reasonMissing.set(false);
    this.open({ kind: 'reopen' });
  }

  /** CF-130 (ADR-097): tells the approver the shortlist is waiting; any later change clears it. */
  requestApproval(): void {
    const sourcing = this.sourcing();
    if (!sourcing || this.busy()) return;
    this.mutate(
      this.api.requestApproval(sourcing.id, sourcing.version),
      $localize`:@@sourcing.requestedNotice:Marked ready for approval.`,
    );
  }

  open(dialog: Dialog): void {
    this.notice.set('');
    this.error.set('');
    this.dialogError.set('');
    this.dialog.set(dialog);
  }

  close(): void {
    if (!this.busy()) this.dialog.set(null);
  }

  confirmDialog(): void {
    const sourcing = this.sourcing();
    const dialog = this.dialog();
    if (!sourcing || !dialog || this.busy()) return;
    switch (dialog.kind) {
      case 'assess': {
        const rationale = this.assessRationale.trim();
        if (this.needsRationale() && !rationale) {
          this.rationaleMissing.set(true);
          return;
        }
        const assessment: Assessment = {
          result: this.assessResult,
          criteria: { ...this.assessCriteria } as Criteria,
          rationale: rationale || null,
        };
        if (dialog.others?.length) {
          const ids = [dialog.candidate, ...dialog.others].map((candidate) => candidate.id);
          this.pickedCandidates.set(new Set());
          this.mutate(
            this.api.assessMany(sourcing.id, ids, assessment, sourcing.version),
            $localize`:@@sourcing.assessedManyNotice:Prequalification recorded for ${ids.length}:count: candidates.`,
          );
          return;
        }
        this.mutate(
          this.api.assess(sourcing.id, dialog.candidate.id, assessment, sourcing.version),
          $localize`:@@sourcing.assessedNotice:Prequalification recorded for ${ltr(dialog.candidate.code)}:code:.`,
        );
        return;
      }
      case 'fastPath': {
        const reason = this.fastPathRationale.trim();
        if (reason.length < REASON_MIN) {
          this.reasonMissing.set(true);
          return;
        }
        this.mutate(
          this.api.fastPath(
            sourcing.id,
            dialog.firms.map((firm) => firm.subcontractorId),
            reason,
            sourcing.version,
          ),
          $localize`:@@sourcing.fastPathNotice:Shortlist approved on the low-value fast path.`,
        );
        return;
      }
      case 'remove':
        this.mutate(
          this.api.removeCandidate(sourcing.id, dialog.candidate.id, sourcing.version),
          $localize`:@@sourcing.removedNotice:${ltr(dialog.candidate.code)}:code: is no longer being considered. Its record is kept.`,
        );
        return;
      case 'approve':
        this.mutate(
          this.api.approve(sourcing.id, sourcing.version),
          $localize`:@@sourcing.approvedNotice:Shortlist approved.`,
        );
        return;
      case 'reopen': {
        const reason = this.reopenReason.trim();
        if (reason.length < REASON_MIN) {
          this.reasonMissing.set(true);
          return;
        }
        this.mutate(
          this.api.reopen(sourcing.id, reason, sourcing.version),
          $localize`:@@sourcing.reopenedNotice:Shortlist reopened. The earlier approval is kept in the history.`,
        );
        return;
      }
      case 'trades':
        this.mutate(
          this.api.setTrades(sourcing.id, [...this.selectedTrades], sourcing.version),
          $localize`:@@sourcing.tradesNotice:Sourced trades updated.`,
        );
        return;
    }
  }

  dialogHeading(dialog: Dialog): string {
    switch (dialog.kind) {
      case 'assess':
        return dialog.others?.length
          ? $localize`:@@sourcing.assessManyTitle:Prequalify ${dialog.others.length + 1}:count: candidates`
          : $localize`:@@sourcing.assessTitle:Prequalify ${ltr(dialog.candidate.code)}:code:`;
      case 'fastPath':
        return $localize`:@@sourcing.fastPathTitle:Approve on the low-value fast path?`;
      case 'remove':
        return $localize`:@@sourcing.removeTitle:Stop considering ${ltr(dialog.candidate.code)}:code:?`;
      case 'approve':
        return $localize`:@@sourcing.approveTitle:Approve this shortlist?`;
      case 'reopen':
        return $localize`:@@sourcing.reopenTitle:Reopen the approved shortlist?`;
      case 'trades':
        return $localize`:@@sourcing.tradesTitle:Trades being sourced`;
    }
  }

  dialogConfirmLabel(dialog: Dialog): string {
    switch (dialog.kind) {
      case 'assess':
        return $localize`:@@sourcing.saveAssessment:Save prequalification`;
      case 'fastPath':
        return $localize`:@@sourcing.fastPathConfirm:Approve on the fast path`;
      case 'remove':
        return $localize`:@@sourcing.removeCandidate:Stop considering`;
      case 'approve':
        return $localize`:@@sourcing.approve:Approve shortlist`;
      case 'reopen':
        return $localize`:@@sourcing.reopen:Reopen shortlist`;
      case 'trades':
        return $localize`:@@sourcing.saveTrades:Save trades`;
    }
  }

  /**
   * After a change the control that triggered it may no longer exist (an approve button, a shortlist
   * toggle); focus then moves to the announced notice instead of falling back to the page body.
   */
  private keepFocus(): void {
    setTimeout(() => {
      const active = this.document.activeElement;
      if (!active || active === this.document.body || !active.isConnected)
        this.document.getElementById('sourcing-notice')?.focus();
    });
  }

  /**
   * Applies one change and shows the sourcing exactly as the server returned it. A stale screen is
   * never overwritten: the latest version is loaded and the person is asked to review and retry.
   */
  private mutate(request: Observable<SourcingDetail>, success: string): void {
    this.busy.set(true);
    this.notice.set('');
    this.error.set('');
    this.dialogError.set('');
    request.subscribe({
      next: (updated) => {
        this.sourcing.set(updated);
        this.busy.set(false);
        this.dialog.set(null);
        this.picked.set(new Map());
        this.notice.set(success);
        this.keepFocus();
        if (this.canAddCandidates()) this.discover(this.discoverPage);
        else this.discovery.set(null);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error)) {
          this.dialog.set(null);
          this.load(
            $localize`:@@sourcing.staleNotice:Someone else changed this sourcing. The latest version is shown; review it and try again.`,
          );
          return;
        }
        const message = sourcingProblemMessage(error);
        if (this.dialog()) this.dialogError.set(message);
        else this.error.set(message);
      },
    });
  }
}

function emptyCriteria(): Record<CriterionKey, CriterionOutcome> {
  return {
    tradeFit: 'NotAssessed',
    geographicCoverage: 'NotAssessed',
    capacity: 'NotAssessed',
    experience: 'NotAssessed',
    compliance: 'NotAssessed',
    risk: 'NotAssessed',
    pastPerformance: 'NotAssessed',
  };
}
