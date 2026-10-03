import { DOCUMENT } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { NotInPlan } from '../../shared/ui/not-in-plan';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { invitationStatusLabel } from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { requestKey } from '../../shared/util/request-key';
import {
  REASON_MAX,
  REASON_MIN,
  describeLocal,
  fileSize,
  isStale,
} from '../tendering/tendering.api';
import {
  EvaluationApi,
  EvaluationOverview,
  EvaluatorAssignment,
  EvaluatorBidState,
  OpenedFile,
  OpenedFileClassification,
  TenderOpening,
  evaluationProblemMessage,
} from './evaluation.api';
import { EvaluationCommercial } from './evaluation-commercial';
import { EvaluationGaps } from './evaluation-gaps';
import {
  classificationLabel,
  flagLabel,
  gapLabel,
  levelingStatusLabel,
  openingStateLabel,
  scorecardStatusLabel,
  stageLabel,
} from './evaluation-labels';
import { EvaluationTechnical, ScorecardDrafts } from './evaluation-technical';
import { TenderStageHeader } from '../tendering/tender-stage-header';

export type EvaluationTab = 'overview' | 'technical' | 'commercial' | 'gaps';

/**
 * Bid opening and evaluation of one tender (Part 9). Before opening it shows only what receipts already show and, when the
 * tender is closed, the explicit opening action. After opening it is the evaluation workspace: overview and progress, the
 * technical evaluation, commercial leveling and the deviations and gaps. Which sections appear follows the user's rights, but
 * the server decides every read and write — hiding a tab here is never the security boundary. Nothing here selects,
 * recommends or awards a bidder.
 */
@Component({
  selector: 'app-evaluation-page',
  imports: [
    TenderStageHeader,
    FormsModule,
    RouterLink,
    BusinessDatePipe,
    ConfirmDialog,
    EvaluationTechnical,
    EvaluationCommercial,
    EvaluationGaps,
    NotInPlan,
  ],
  templateUrl: './evaluation-page.html',
  styleUrl: './evaluation-page.scss',
  providers: [ScorecardDrafts],
})
export class EvaluationPage implements OnInit {
  private readonly api = inject(EvaluationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly session = inject(SessionService);
  /** CF-133: the scorecard policies page is open to their readers and managers (the route guard decides again). */
  readonly readsPolicies =
    this.session.hasPermission('Evaluation.View') ||
    this.session.hasPermission('Evaluation.ManagePolicy');
  openPolicyVersion(version: number): string {
    return $localize`:@@evaluation.openPolicyVersion:Open version ${version}:version: of this policy`;
  }
  private readonly entitlements = inject(EntitlementsService);
  readonly locale = inject(LocaleService).locale;

  readonly stageLabel = stageLabel;
  readonly openingStateLabel = openingStateLabel;
  readonly flagLabel = flagLabel;
  readonly gapLabel = gapLabel;
  readonly levelingLabel = levelingStatusLabel;
  readonly scorecardLabel = scorecardStatusLabel;
  readonly classificationLabel = classificationLabel;
  readonly invitationStatusLabel = invitationStatusLabel;
  readonly reasonMax = REASON_MAX;
  readonly size = (bytes: number) => fileSize(bytes, this.locale);

  readonly tenderId = signal('');
  readonly opening = signal<TenderOpening | null>(null);
  readonly overview = signal<EvaluationOverview | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly progressStale = signal(false);
  readonly busy = signal(false);
  readonly dialogError = signal('');
  /** The tab the address asks for; CF-104: the shown tab falls back to the first one this reader has. */
  private readonly requestedTab = signal<EvaluationTab>('overview');
  readonly tab = computed<EvaluationTab>(() => {
    const tabs = this.tabs();
    const requested = this.requestedTab();
    return tabs.includes(requested) ? requested : (tabs[0] ?? 'overview');
  });

  /**
   * CF-104 AC1 (B-104-1): once the evaluation has loaded, an address asking for a tab this reader does not have is rewritten to the tab
   * shown (replacing the history entry), so the address never names a section the page is not showing.
   */
  private readonly clampAddress = effect(() => {
    if (!this.overview()) return;
    const shown = this.tab();
    if (this.requestedTab() === shown) return;
    untracked(
      () =>
        void this.router.navigate([], {
          queryParams: { tab: shown === 'overview' ? null : shown },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        }),
    );
  });

  readonly confirmingOpen = signal(false);
  private openKey = '';
  readonly completing = signal(false);
  excludeDrafts = false;
  readonly reopening = signal(false);
  reopenReason = '';
  /** Part 10: taking a closed negotiation round's responses into the evaluation, after a confirmation. */
  readonly refreshing = signal(false);
  policyChoice = '';
  /** CF-040: why another policy than the declared one is used. */
  deviationReason = '';
  /** CF-043: this tender's panel minimum (empty: the company's), and the member chosen to assign. */
  panelMinimum: number | null = null;
  assignChoice = '';
  /** Classification being chosen per file (custodians only). */
  readonly classifications = signal<Record<string, OpenedFileClassification>>({});

  readonly opened = computed(() => this.opening()?.state === 'Opened');
  readonly access = computed(() => this.overview()?.access ?? null);
  readonly tabs = computed<readonly EvaluationTab[]>(() => {
    const access = this.access();
    if (!this.opened() || !access) return ['overview'];
    return [
      'overview',
      ...(access.viewTechnical ? (['technical'] as const) : []),
      ...(access.viewCommercial ? (['commercial'] as const) : []),
      'gaps',
    ];
  });
  readonly draftCount = computed(() =>
    (this.overview()?.bids ?? []).reduce((total, bid) => total + bid.draftScorecards, 0),
  );
  readonly readOnly = computed(
    () =>
      !!this.overview()?.tenderCancelled ||
      !!this.overview()?.tenderAwarded ||
      this.overview()?.stage === 'Completed',
  );
  /** Part 10: a closed round brought responses this evaluation does not cover yet. */
  readonly roundPending = computed(() => {
    const view = this.overview();
    return !!view?.evaluation && (view.latestClosedRound ?? 0) > (view.evaluation.round ?? 0);
  });
  /** Part 10 links: the negotiation rounds and the decision, when the plan includes awards. */
  readonly negotiationAvailable = computed(() => this.opened() && this.entitlements.has('award'));
  readonly decisionAvailable = computed(
    () => this.negotiationAvailable() && this.session.hasPermission('Decision.View'),
  );
  /**
   * CF-007: what follows a completed evaluation, for this plan and this reader — never "the decision stage" on a plan without the award, while a
   * closed round still has to be taken in, or for a reader who cannot open the decision (the server judges readiness again).
   */
  readonly nextStage = computed<'lastStage' | 'roundPending' | 'leadership' | 'decision'>(() =>
    !this.entitlements.has('award')
      ? 'lastStage'
      : this.roundPending()
        ? 'roundPending'
        : this.session.hasPermission('Decision.View')
          ? 'decision'
          : 'leadership',
  );

  nextStageText(): string {
    switch (this.nextStage()) {
      case 'lastStage':
        return $localize`:@@evaluation.next.lastStage:Evaluation is the last stage in your plan: this evidence stays as the record.`;
      case 'roundPending':
        return $localize`:@@evaluation.next.roundPending:A closed negotiation round must be taken into the evaluation first (owner: Procurement Manager).`;
      case 'leadership':
        return $localize`:@@evaluation.next.leadership:The evidence is handed to procurement leadership for the decision.`;
      default:
        return $localize`:@@evaluation.next.decision:The evidence is ready for the decision stage.`;
    }
  }

  ngOnInit(): void {
    this.tenderId.set(this.route.snapshot.paramMap.get('id') ?? '');
    this.route.queryParamMap.subscribe((params) => {
      const requested = params.get('tab') as EvaluationTab | null;
      this.requestedTab.set(
        requested && ['overview', 'technical', 'commercial', 'gaps'].includes(requested)
          ? requested
          : 'overview',
      );
    });
    this.load();
  }

  load(afterNotice = ''): void {
    this.loading.set(this.opening() === null);
    this.error.set('');
    forkJoin([this.api.opening(this.tenderId()), this.api.overview(this.tenderId())]).subscribe({
      next: ([opening, overview]) => {
        this.opening.set(opening);
        this.overview.set(overview);
        this.policyChoice ||= overview.policyOptions[0]?.policyId ?? '';
        this.loading.set(false);
        if (afterNotice) this.announce(afterNotice);
      },
      error: (error: unknown) => {
        this.error.set(evaluationProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  tabLabel(tab: EvaluationTab): string {
    switch (tab) {
      case 'overview':
        return $localize`:@@evaluation.tabOverview:Overview`;
      case 'technical':
        return $localize`:@@evaluation.tabTechnical:Technical evaluation`;
      case 'commercial':
        return $localize`:@@evaluation.tabCommercial:Commercial leveling`;
      default:
        return $localize`:@@evaluation.tabGaps:Deviations and gaps`;
    }
  }

  selectTab(tab: EvaluationTab): void {
    void this.router.navigate([], {
      queryParams: { tab: tab === 'overview' ? null : tab },
      replaceUrl: true,
    });
  }

  /** Arrow keys move between tabs, as a tab list does. */
  tabKey(event: KeyboardEvent, index: number): void {
    const tabs = this.tabs();
    const rtl = this.document.documentElement.dir === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (
      event.key !== forward &&
      event.key !== backward &&
      event.key !== 'Home' &&
      event.key !== 'End'
    )
      return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === forward ? 1 : -1) + tabs.length) % tabs.length;
    this.selectTab(tabs[next]);
    setTimeout(() => this.document.getElementById(`evaluation-tab-${tabs[next]}`)?.focus());
  }

  closedShown(): string {
    const closure = this.opening()?.closure;
    return closure ? describeLocal(closure.closedAt, this.zone(), this.locale) : '—';
  }

  scheduledShown(): string {
    const closure = this.opening()?.closure;
    return closure ? describeLocal(closure.scheduledDeadline, this.zone(), this.locale) : '—';
  }

  openingClosedShown(): string {
    const record = this.opening()?.opening;
    return record ? describeLocal(record.closedAt, this.zone(), this.locale) : '—';
  }

  private zone(): string {
    return this.opening()?.timeZoneId ?? 'UTC';
  }

  startOpen(): void {
    this.openKey = requestKey();
    this.dialogError.set('');
    this.confirmingOpen.set(true);
  }

  confirmOpen(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.open(this.tenderId(), this.openKey).subscribe({
      next: (opening) => {
        this.busy.set(false);
        this.confirmingOpen.set(false);
        this.opening.set(opening);
        this.load(
          $localize`:@@evaluation.opened:The bids were opened. Authorized evaluators can now read them.`,
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.dialogError.set(evaluationProblemMessage(error));
      },
    });
  }

  fileUrl(file: { id: string }): string {
    return this.api.fileUrl(this.tenderId(), file.id);
  }

  classificationFor(file: OpenedFile): OpenedFileClassification {
    return this.classifications()[file.id] ?? file.classification;
  }

  pickClassification(file: OpenedFile, value: OpenedFileClassification): void {
    this.classifications.update((current) => ({ ...current, [file.id]: value }));
  }

  saveClassification(file: OpenedFile): void {
    const chosen = this.classificationFor(file);
    if (this.busy() || chosen === 'Unclassified' || chosen === file.classification) return;
    this.busy.set(true);
    this.error.set('');
    this.api.classify(this.tenderId(), file.id, chosen, file.version).subscribe({
      next: (opening) => {
        this.busy.set(false);
        this.opening.set(opening);
        this.announce($localize`:@@evaluation.fileClassified:File classification saved.`);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error)) this.load(this.staleText());
        else this.error.set(evaluationProblemMessage(error));
      },
    });
  }

  // ---------------------------------------------------------------- CF-049 (ADR-100): withdrawal after opening

  /** Who prepares the evaluation or the decision records a firm's withdrawal, until the award. */
  canRecordWithdrawal(): boolean {
    const item = this.opening();
    return (
      !!item?.opening &&
      item.status !== 'Cancelled' &&
      (this.session.hasPermission('Evaluation.Complete') ||
        this.session.hasPermission('Decision.Prepare'))
    );
  }

  readonly withdrawingBid = signal<string | null>(null);
  withdrawalReason = '';
  withdrawalReference = '';
  private withdrawalKey = requestKey();

  askWithdrawal(bidId: string): void {
    this.withdrawalReason = '';
    this.withdrawalReference = '';
    this.withdrawalKey = requestKey();
    this.withdrawingBid.set(bidId);
  }

  recordWithdrawal(bidId: string): void {
    const reason = this.withdrawalReason.trim();
    const reference = this.withdrawalReference.trim();
    if (this.busy() || reason.length < 3 || !reference) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .recordWithdrawal(this.tenderId(), bidId, reason, reference, this.withdrawalKey)
      .subscribe({
        next: (opening) => {
          this.busy.set(false);
          this.withdrawingBid.set(null);
          this.opening.set(opening);
          this.announce(
            $localize`:@@evaluation.withdrawalRecorded:Withdrawal recorded. Recompute the recommendation before deciding.`,
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (isStale(error)) this.load(this.staleText());
          else this.error.set(evaluationProblemMessage(error));
        },
      });
  }

  /** CF-043 (ADR-106): names the chosen member to the evaluation panel. */
  assign(): void {
    if (this.busy() || !this.assignChoice) return;
    this.busy.set(true);
    this.error.set('');
    this.api.assign(this.tenderId(), this.assignChoice).subscribe({
      next: (overview) => {
        this.busy.set(false);
        this.assignChoice = '';
        this.overview.set(overview);
        this.announce($localize`:@@evaluation.assigned:Evaluator added to the panel.`);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(evaluationProblemMessage(error));
      },
    });
  }

  unassign(assignment: EvaluatorAssignment): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.unassign(this.tenderId(), assignment.id, assignment.version).subscribe({
      next: (overview) => {
        this.busy.set(false);
        this.overview.set(overview);
        this.announce(
          $localize`:@@evaluation.unassigned:Evaluator removed from the panel. Their scorecards are kept as they are.`,
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error)) this.load(this.staleText());
        else this.error.set(evaluationProblemMessage(error));
      },
    });
  }

  evaluatorStatusLabel(status: EvaluatorBidState): string {
    switch (status) {
      case 'Submitted':
        return $localize`:@@evaluatorStatus.submitted:Submitted`;
      case 'Draft':
        return $localize`:@@evaluatorStatus.draft:Draft`;
      case 'RescoreRequired':
        return $localize`:@@evaluatorStatus.rescore:Rescore needed`;
      default:
        return $localize`:@@evaluatorStatus.notStarted:Not started`;
    }
  }

  /** CF-040 (ADR-105): the tender declared a policy and another one is chosen. */
  deviates(): boolean {
    const declared = this.overview()?.policyOptions.find((option) => option.declared);
    return !!declared && declared.policyId !== this.policyChoice;
  }

  startEvaluation(): void {
    if (this.busy() || !this.policyChoice) return;
    const deviates = this.deviates();
    if (deviates && this.deviationReason.trim().length < REASON_MIN) {
      this.error.set(
        $localize`:@@control.reasonTooShort:Explain the reason (at least ${REASON_MIN}:min: characters).`,
      );
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api
      .start(
        this.tenderId(),
        this.policyChoice,
        this.overview()?.evaluation?.version ?? null,
        deviates ? this.deviationReason.trim() : null,
        this.panelMinimum ? Number(this.panelMinimum) : null,
      )
      .subscribe({
        next: (overview) => {
          this.busy.set(false);
          this.overview.set(overview);
          this.announce(
            $localize`:@@evaluation.started:Evaluation started. The policy version is now fixed for this tender.`,
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (isStale(error)) this.load(this.staleText());
          else this.error.set(evaluationProblemMessage(error));
        },
      });
  }

  startComplete(): void {
    this.excludeDrafts = false;
    this.dialogError.set('');
    this.completing.set(true);
  }

  confirmComplete(): void {
    const evaluation = this.overview()?.evaluation;
    if (this.busy() || !evaluation) return;
    if (this.draftCount() > 0 && !this.excludeDrafts) {
      this.dialogError.set(
        $localize`:@@evaluation.completeDraftsRequired:Draft scorecards are still open. Tick the box to complete without them, or ask the evaluators to submit.`,
      );
      return;
    }
    this.busy.set(true);
    this.api.complete(this.tenderId(), this.excludeDrafts, evaluation.version).subscribe({
      next: (overview) => {
        this.busy.set(false);
        this.completing.set(false);
        this.overview.set(overview);
        this.announce(
          $localize`:@@evaluation.completedNoSelection:Evaluation completed; no bidder was selected.` +
            ' ' +
            this.nextStageText(),
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error)) {
          this.completing.set(false);
          this.load(this.staleText());
        } else this.dialogError.set(evaluationProblemMessage(error));
      },
    });
  }

  startReopen(): void {
    this.reopenReason = '';
    this.dialogError.set('');
    this.reopening.set(true);
  }

  confirmReopen(): void {
    const evaluation = this.overview()?.evaluation;
    if (this.busy() || !evaluation) return;
    if (this.reopenReason.trim().length < REASON_MIN) {
      this.dialogError.set(
        $localize`:@@control.reasonTooShort:Explain the reason (at least ${REASON_MIN}:min: characters).`,
      );
      return;
    }
    this.busy.set(true);
    this.api.reopen(this.tenderId(), this.reopenReason.trim(), evaluation.version).subscribe({
      next: (overview) => {
        this.busy.set(false);
        this.reopening.set(false);
        this.overview.set(overview);
        this.announce($localize`:@@evaluation.reopened:Evaluation reopened.`);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error)) {
          this.reopening.set(false);
          this.load(this.staleText());
        } else this.dialogError.set(evaluationProblemMessage(error));
      },
    });
  }

  startRefresh(): void {
    this.dialogError.set('');
    this.refreshing.set(true);
  }

  confirmRefresh(): void {
    const evaluation = this.overview()?.evaluation;
    if (this.busy() || !evaluation) return;
    this.busy.set(true);
    this.api.refresh(this.tenderId(), evaluation.version).subscribe({
      next: (overview) => {
        this.busy.set(false);
        this.refreshing.set(false);
        this.overview.set(overview);
        this.announce(
          $localize`:@@evaluation.refreshed:The round's responses are now the evaluation evidence. Rescore and relevel what changed, then complete the evaluation again.`,
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error)) {
          this.refreshing.set(false);
          this.load(this.staleText());
        } else this.dialogError.set(evaluationProblemMessage(error));
      },
    });
  }

  /** A child section changed the evaluation: refresh the overview (progress, gaps, status). */
  refreshOverview(): void {
    this.api.overview(this.tenderId()).subscribe({
      next: (overview) => {
        this.overview.set(overview);
        this.progressStale.set(false);
      },
      // The change itself was saved; only the progress summary could not be refreshed, and the page says so.
      error: () => this.progressStale.set(true),
    });
  }

  /**
   * States an outcome in the polite status region. Focus moves to it only when the control that acted is gone (a dialog
   * closed, a section re-rendered) and no modal dialog is open; otherwise focus stays where the user is working.
   */
  announce(message: string): void {
    const acting = this.document.activeElement;
    this.notice.set(message);
    if (!message) return;
    setTimeout(() => {
      const current = this.document.activeElement;
      const lost =
        !current || current === this.document.body || !current.isConnected || !acting?.isConnected;
      if (lost && !this.document.querySelector('[aria-modal="true"]'))
        this.document.getElementById('evaluation-notice')?.focus({ preventScroll: false });
    });
  }

  staleText(): string {
    return $localize`:@@evaluation.stale:Someone else changed this evaluation. The latest version is shown; check it and try again.`;
  }
}
