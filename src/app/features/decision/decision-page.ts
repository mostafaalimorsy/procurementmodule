import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { money } from '../evaluation/evaluation-format';
import { AwardBaselineView } from './award-baseline';
import { AwardOutcome } from './award-outcome';
import { DecisionWorkspace, DecisionApi, decisionProblemMessage } from './decision.api';
import { DecisionApproval } from './decision-approval';
import { DecisionControlsView } from './decision-controls';
import {
  decisionStatusLabel,
  liveStateLabel,
  outcomeLabel,
  decisionStepLabel,
  readinessGapLabel,
  readinessLabel,
  timelineLabel,
} from './decision-labels';
import { DecisionPrepare } from './decision-prepare';
import { DecisionRecommendation } from './decision-recommendation';
import { RequestKeys } from './request-keys';
import { TenderStageHeader } from '../tendering/tender-stage-header';

export type DecisionTab =
  'overview' | 'recommendation' | 'decision' | 'approval' | 'award' | 'timeline';
const TABS: readonly DecisionTab[] = [
  'overview',
  'recommendation',
  'decision',
  'approval',
  'award',
  'timeline',
];

/**
 * The decision workspace of one evaluated tender (Part 10): readiness, the policy recommendation and its evidence, the
 * prepared decision, its approval route and actions, the award and its immutable baseline, and the dated history. A
 * recommendation is a ranked policy result — never a selection; approval is not award; and every action is decided again by
 * the server, so what is shown here is presentation only.
 */
@Component({
  selector: 'app-decision-page',
  imports: [
    TenderStageHeader,
    RouterLink,
    BusinessDatePipe,
    DecisionRecommendation,
    DecisionPrepare,
    DecisionApproval,
    DecisionControlsView,
    AwardBaselineView,
    AwardOutcome,
  ],
  templateUrl: './decision-page.html',
  styleUrl: './decision-page.scss',
  providers: [RequestKeys],
})
export class DecisionPage implements OnInit {
  private readonly api = inject(DecisionApi);

  /** CF-003: the award summary download (same origin; the session authorizes it). */
  awardSummaryUrl(): string {
    return this.api.awardSummaryUrl(this.tenderId());
  }
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  readonly locale = inject(LocaleService).locale;
  /** Approvers may follow the decision without reading the evaluation: the evaluation links follow that right. */
  readonly readsEvaluation = inject(SessionService).hasPermission('Evaluation.View');

  readonly readinessLabel = readinessLabel;
  readonly stepLabel = decisionStepLabel;
  /**
   * CF-008: once a decision is submitted, the evidence readiness no longer reads "ready for a recommendation" beside a decision that is past
   * that point — it reads as the evidence being current; the decision's own step says what comes next.
   */
  evidenceLabel(view: DecisionWorkspace): string {
    const past = ['AwaitingApproval', 'Approved', 'Awarded'].includes(
      view.currentStep?.state ?? '',
    );
    return view.readiness.state === 'Ready' && past
      ? $localize`:@@readiness.evidenceCurrent:Evidence current`
      : readinessLabel(view.readiness.state);
  }
  readonly gapLabel = readinessGapLabel;
  readonly statusLabel = decisionStatusLabel;
  readonly liveStateLabel = liveStateLabel;
  readonly outcomeLabel = outcomeLabel;
  readonly timelineLabel = timelineLabel;

  readonly tenderId = signal('');
  readonly workspace = signal<DecisionWorkspace | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  /** The bids are not opened yet: an empty state, not an error. */
  readonly notOpened = signal(false);
  readonly notice = signal('');
  /** The tab the address asks for; CF-104: the shown tab falls back to the first one this reader has. */
  private readonly requestedTab = signal<DecisionTab>('overview');
  readonly tab = computed<DecisionTab>(() => {
    const tabs = this.tabs();
    const requested = this.requestedTab();
    return tabs.includes(requested) ? requested : (tabs[0] ?? 'overview');
  });

  /** CF-104 AC1 (B-104-1): an address naming a tab the page does not show is rewritten to the tab shown (history entry replaced). */
  private readonly clampAddress = effect(() => {
    if (!this.workspace()) return;
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

  readonly tabs = computed<readonly DecisionTab[]>(() => {
    const view = this.workspace();
    return TABS.filter((tab) => tab !== 'award' || !!view?.award || view?.status === 'Approved');
  });
  readonly topRanked = computed(() =>
    (this.workspace()?.recommendation?.candidates ?? []).filter(
      (candidate) => candidate.eligible && candidate.rank === 1,
    ),
  );
  readonly fresh = computed(() => {
    const state = this.workspace()?.recommendation?.liveState;
    return state === 'Ready' || state === 'InsufficientHistory';
  });

  ngOnInit(): void {
    this.tenderId.set(this.route.snapshot.paramMap.get('id') ?? '');
    this.route.queryParamMap.subscribe((params) => {
      const requested = params.get('tab') as DecisionTab | null;
      this.requestedTab.set(requested && TABS.includes(requested) ? requested : 'overview');
    });
    this.load();
  }

  load(afterNotice = ''): void {
    this.loading.set(this.workspace() === null && !this.notOpened());
    this.error.set('');
    this.api.decision(this.tenderId()).subscribe({
      next: (view) => {
        this.notOpened.set(false);
        this.workspace.set(view);
        this.loading.set(false);
        if (afterNotice) this.announce(afterNotice);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        const code = error instanceof HttpErrorResponse ? error.error?.code : null;
        if (code === 'opening.not_opened') this.notOpened.set(true);
        else this.error.set(decisionProblemMessage(error));
      },
    });
  }

  updated(view: DecisionWorkspace): void {
    this.workspace.set(view);
  }

  tabLabel(tab: DecisionTab): string {
    switch (tab) {
      case 'overview':
        return $localize`:@@decision.tabOverview:Overview`;
      case 'recommendation':
        return $localize`:@@decision.tabRecommendation:Recommendation`;
      case 'decision':
        return $localize`:@@decision.tabDecision:Decision`;
      case 'approval':
        return $localize`:@@decision.tabApproval:Approval`;
      case 'award':
        return $localize`:@@decision.tabAward:Award`;
      default:
        return $localize`:@@decision.tabTimeline:Timeline`;
    }
  }

  selectTab(tab: DecisionTab): void {
    void this.router.navigate([], {
      queryParams: { tab: tab === 'overview' ? null : tab },
      replaceUrl: true,
    });
    this.requestedTab.set(tab);
  }

  /** Arrow keys move between tabs, as a tab list does (mirrored in Arabic). */
  tabKey(event: KeyboardEvent, index: number): void {
    const tabs = this.tabs();
    const rtl = this.document.documentElement.dir === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (![forward, backward, 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === forward ? 1 : -1) + tabs.length) % tabs.length;
    this.selectTab(tabs[next]);
    setTimeout(() => this.document.getElementById(`decision-tab-${tabs[next]}`)?.focus());
  }

  money(amount: string | null | undefined): string {
    return money(amount, this.locale);
  }

  announce(message: string): void {
    this.notice.set(message);
    if (!message) return;
    setTimeout(() => {
      const current = this.document.activeElement;
      const lost = !current || current === this.document.body || !current.isConnected;
      if (lost && !this.document.querySelector('[aria-modal="true"]'))
        this.document.getElementById('decision-notice')?.focus();
    });
  }
}
