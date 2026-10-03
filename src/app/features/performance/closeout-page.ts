import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RoleHoldersService } from '../../core/auth/role-holders.service';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { roleList } from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { parseMoney } from '../../core/localization/money';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { CloseoutReadonly } from './closeout-readonly';
import { requestKey } from '../../shared/util/request-key';
import { money } from '../evaluation/evaluation-format';
import {
  COUNT_MAX,
  CloseoutWorkspace,
  CommercialDraft,
  ExecutionDraft,
  FEEDBACK_MAX,
  MOBILIZATION_OUTCOMES,
  NOTE_MAX,
  PERFORMANCE_PERMISSIONS,
  PerformanceApi,
  RATINGS,
  REASON_MAX,
  REASON_MIN,
  OUTCOME_TYPES,
  REHIRE_CHOICES,
  VARIATION_CAUSES,
  commercialDraft,
  executionDraft,
  performanceProblemMessage,
} from './performance.api';
import {
  categoryLabel,
  costDirectionLabel,
  direction,
  durationDirectionLabel,
  eventLabel,
  lifecycleLabel,
  missingLabel,
  missingStep,
  mobilizationLabel,
  outcomeEffectLabel,
  outcomeTypeLabel,
  ratingLabel,
  rehireLabel,
  scheduleOutcomeLabel,
  signedAmount,
  signedDays,
  signedPercent,
  timingWarningLabel,
  variationCauseLabel,
} from './performance-labels';

export type CloseoutStep =
  'outcome' | 'schedule' | 'commercial' | 'quality' | 'issues' | 'feedback' | 'review' | 'history';
const STEPS: readonly CloseoutStep[] = [
  'outcome',
  'schedule',
  'commercial',
  'quality',
  'issues',
  'feedback',
  'review',
  'history',
];
/** Which saved section a step's fields belong to: Commercial/QS owns commercial, the Project Manager owns execution. */
const SECTION: Partial<Record<CloseoutStep, 'commercial' | 'execution'>> = {
  schedule: 'execution',
  commercial: 'commercial',
  quality: 'execution',
  issues: 'commercial',
  feedback: 'execution',
};

/**
 * The performance closeout of one award (Part 11): the frozen promise beside the actual outcome, recorded in short structured
 * steps by the people who own them, with completeness shown throughout and an explicit, confirmed close. A closed closeout is
 * read-only; a correction reopens it with a reason and the next close is a new version. Everything here is presentation — the
 * server decides every save, close and reopen.
 */
@Component({
  selector: 'app-closeout-page',
  imports: [FormsModule, RouterLink, BusinessDatePipe, ConfirmDialog, CloseoutReadonly],
  templateUrl: './closeout-page.html',
  styleUrl: './closeout-page.scss',
})
export class CloseoutPage implements OnInit {
  private readonly api = inject(PerformanceApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly roleHolders = inject(RoleHoldersService);
  readonly locale = inject(LocaleService).locale;
  /** The award baseline link opens the decision workspace, which has its own right. */
  readonly readsDecision = inject(SessionService).hasPermission('Decision.View');

  readonly lifecycleLabel = lifecycleLabel;
  readonly ratingLabel = ratingLabel;
  readonly mobilizationLabel = mobilizationLabel;
  readonly rehireLabel = rehireLabel;
  readonly causeLabel = variationCauseLabel;
  readonly scheduleLabel = scheduleOutcomeLabel;
  readonly missingLabel = missingLabel;
  readonly outcomeLabel = outcomeTypeLabel;
  readonly outcomeEffect = outcomeEffectLabel;
  readonly timingLabel = timingWarningLabel;
  readonly outcomeTypes = OUTCOME_TYPES;
  readonly eventLabel = eventLabel;
  readonly categoryLabel = categoryLabel;
  readonly percent = signedPercent;
  readonly days = signedDays;
  readonly costDirection = costDirectionLabel;
  readonly durationDirection = durationDirectionLabel;
  readonly direction = direction;
  readonly ratings = RATINGS;
  readonly mobilizations = MOBILIZATION_OUTCOMES;
  readonly rehireChoices = REHIRE_CHOICES;
  readonly causes = VARIATION_CAUSES;
  readonly noteMax = NOTE_MAX;
  readonly feedbackMax = FEEDBACK_MAX;
  readonly reasonMax = REASON_MAX;
  readonly countMax = COUNT_MAX;

  readonly awardId = signal('');
  readonly workspace = signal<CloseoutWorkspace | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly step = signal<CloseoutStep>('outcome');
  readonly saving = signal<'commercial' | 'execution' | null>(null);
  /** A refused save, shown only on the steps of the section it belongs to. */
  readonly sectionError = signal<{ section: 'commercial' | 'execution'; message: string } | null>(
    null,
  );
  /** Client-side input problems (money format, whole-number counts), by field. */
  readonly moneyErrors = signal<Readonly<Record<string, string>>>({});
  readonly confirming = signal<'finalize' | 'reopen' | null>(null);
  readonly acting = signal(false);
  readonly reasonMissing = signal(false);
  /** CF-036: finalizing a project another Project Manager is assigned to needs an explicit confirmation. */
  readonly notAssignedMissing = signal(false);
  notAssignedConfirmed = false;
  /** CF-082: the finalizer confirms the timing warnings the server named. */
  readonly timingMissing = signal(false);
  timingConfirmed = false;
  reason = '';
  commercial: CommercialDraft = commercialDraft(EMPTY_COMMERCIAL);
  execution: ExecutionDraft = executionDraft(EMPTY_EXECUTION);
  /** The section version each draft was loaded from: a save sends it, so a colleague's newer save is never silently overwritten. */
  private commercialBase: string | null = null;
  private executionBase: string | null = null;
  /** Kept across a retry of the same confirmed action, so a lost response never closes or reopens twice. */
  private actionKey = '';
  private actionKind: 'finalize' | 'reopen' | null = null;

  readonly steps = STEPS;
  readonly closed = computed(() => this.workspace()?.lifecycle === 'Closed');
  /** CF-101 (S-ROLES): the roles that may reopen, from the permission matrix; null until read, or when the read failed. */
  readonly reopenRoles = signal<readonly string[] | null>(null);
  /** CF-101 AC2: what a closed closeout tells its reader about reopening — who may, from the matrix, never a hard-coded role. */
  readonly closedNotice = computed(() => {
    const view = this.workspace();
    if (!view || view.lifecycle !== 'Closed') return '';
    if (view.access.reopen)
      return $localize`:@@closeout.readOnlyYouReopen:This closeout is closed and read only. You can reopen it from Review and close.`;
    const roles = this.reopenRoles();
    if (roles === null)
      return $localize`:@@closeout.readOnlyClosedUnknown:This closeout is closed and read only.`;
    if (roles.length === 0)
      return $localize`:@@closeout.readOnlyNoReopener:This closeout is closed and read only. No role in your company can reopen it; contact support.`;
    return $localize`:@@closeout.readOnlyClosedBy:This closeout is closed and read only. Only ${roleList(roles, this.locale)}:roles: can reopen it, with a reason, to correct it.`;
  });
  /** The currency's decimal places, read from the canonical award value ("1000000.00" → 2). */
  readonly decimals = computed(() => {
    const value = this.workspace()?.baseline.awardValue ?? '';
    return value.includes('.') ? value.split('.')[1].length : 0;
  });

  ngOnInit(): void {
    this.awardId.set(this.route.snapshot.paramMap.get('awardId') ?? '');
    this.route.queryParamMap.subscribe((params) => {
      const requested = params.get('step') as CloseoutStep | null;
      this.step.set(requested && STEPS.includes(requested) ? requested : 'outcome');
    });
    this.load();
  }

  load(afterNotice = ''): void {
    this.loading.set(this.workspace() === null);
    this.error.set('');
    this.notice.set('');
    this.sectionError.set(null);
    this.moneyErrors.set({});
    this.api.closeout(this.awardId()).subscribe({
      next: (view) => {
        this.apply(view, 'both');
        this.loading.set(false);
        if (afterNotice) this.announce(afterNotice);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(performanceProblemMessage(error));
      },
    });
  }

  /** Takes the server's view; the section just saved (or both) is reset from it, an unsaved edit of the other one is kept. */
  private apply(view: CloseoutWorkspace, reset: 'commercial' | 'execution' | 'both'): void {
    this.workspace.set(view);
    if (view.lifecycle === 'Closed' && !view.access.reopen) this.readReopenRoles();
    if (reset !== 'execution') {
      this.commercial = commercialDraft(view.commercial);
      this.commercialBase = view.commercial.sectionVersion;
    }
    if (reset !== 'commercial') {
      this.execution = executionDraft(view.execution);
      this.executionBase = view.execution.sectionVersion;
    }
  }

  /** A failed read leaves the role names out (ADR-165: what cannot be read is not shown). */
  private readReopenRoles(): void {
    this.roleHolders.rolesWith(PERFORMANCE_PERMISSIONS.reopen).subscribe({
      next: (roles) => this.reopenRoles.set(roles),
      error: () => this.reopenRoles.set(null),
    });
  }

  sectionOf(step: CloseoutStep): 'commercial' | 'execution' | null {
    return SECTION[step] ?? null;
  }

  canEdit(section: 'commercial' | 'execution' | null): boolean {
    const access = this.workspace()?.access;
    if (!access || !section) return false;
    return section === 'commercial' ? access.editCommercial : access.editExecution;
  }

  stepLabel(step: CloseoutStep): string {
    switch (step) {
      case 'outcome':
        return $localize`:@@closeout.stepOutcome:Outcome`;
      case 'schedule':
        return $localize`:@@closeout.stepSchedule:Schedule`;
      case 'commercial':
        return $localize`:@@closeout.stepCommercial:Commercial`;
      case 'quality':
        return $localize`:@@closeout.stepQuality:Quality & HSE`;
      case 'issues':
        return $localize`:@@closeout.stepIssues:Variations, claims & disputes`;
      case 'feedback':
        return $localize`:@@closeout.stepFeedback:Feedback`;
      case 'review':
        return $localize`:@@closeout.stepReview:Review & close`;
      default:
        return $localize`:@@closeout.stepHistory:History`;
    }
  }

  /** How many completeness items a step still misses, so the step list shows where work remains. */
  missingIn(step: CloseoutStep): number {
    return (this.workspace()?.completeness.missing ?? []).filter((key) => missingStep(key) === step)
      .length;
  }

  selectStep(step: CloseoutStep): void {
    void this.router.navigate([], {
      queryParams: { step: step === 'outcome' ? null : step },
      replaceUrl: true,
    });
    this.step.set(step);
  }

  goToMissing(key: string): void {
    const step = missingStep(key);
    this.selectStep(step);
    setTimeout(() => {
      const target = this.document.getElementById(missingTarget(key));
      target?.focus();
      // A field of a section this person cannot edit is disabled and takes no focus: the step itself does.
      if (!target || this.document.activeElement !== target)
        this.document.getElementById(`closeout-panel-${step}`)?.focus();
    });
  }

  /** Arrow keys move between steps, as a tab list does (mirrored in Arabic). */
  stepKey(event: KeyboardEvent, index: number): void {
    const rtl = this.document.documentElement.dir === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (![forward, backward, 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? STEPS.length - 1
          : (index + (event.key === forward ? 1 : -1) + STEPS.length) % STEPS.length;
    this.selectStep(STEPS[next]);
    setTimeout(() => this.document.getElementById(`closeout-step-${STEPS[next]}`)?.focus());
  }

  /** CF-082: the draft's dates start or finish before the day of the award (UTC), so early works are to be declared. */
  beforeAward(): boolean {
    const view = this.workspace();
    if (!view) return false;
    const awardDay = view.baseline.awardedAtUtc.slice(0, 10);
    return [this.execution.actualStartDate, this.execution.actualCompletionDate].some(
      (date) => !!date && date < awardDay,
    );
  }

  money(amount: string | null | undefined): string {
    return money(amount, this.locale);
  }

  /** The number a plural rule reads for a signed day difference. */
  absDays(days: number | null): number {
    return Math.abs(days ?? 0);
  }

  signedMoney(amount: string | null | undefined): string {
    return signedAmount(amount, this.locale);
  }

  // ------------------------------------------------------------------ saving

  saveCommercial(): void {
    const view = this.workspace();
    if (!view || this.saving()) return;
    const errors: Record<string, string> = {};
    const draft = { ...this.commercial };
    for (const field of [
      'actualFinalCost',
      'variationValue',
      'claimedValue',
      'costToCompleteByOthers',
    ] as const) {
      const parsed = parseMoney(draft[field], this.decimals(), true);
      if (parsed.problem) errors[field] = this.moneyProblem(parsed.problem);
      else draft[field] = parsed.value ?? '';
    }
    for (const field of COUNT_FIELDS) {
      const value = draft[field];
      if (value !== null && value !== undefined && `${value}` !== '' && !isWholeCount(value))
        errors[field] =
          $localize`:@@closeout.countInvalid:Enter a whole number from 0 to ${COUNT_MAX}:max:.`;
    }
    this.moneyErrors.set(errors);
    const first = Object.keys(errors)[0];
    if (first) {
      // The first problem may be on the other commercial step: go there, then focus it.
      this.selectStep(first === 'actualFinalCost' ? 'commercial' : 'issues');
      setTimeout(() => this.document.getElementById(FIELD_IDS[first])?.focus());
      return;
    }
    this.save('commercial', this.api.saveCommercial(view.awardId, this.commercialBase, draft));
  }

  saveExecution(): void {
    const view = this.workspace();
    if (!view || this.saving()) return;
    this.save(
      'execution',
      this.api.saveExecution(view.awardId, this.executionBase, this.execution),
    );
  }

  private save(
    section: 'commercial' | 'execution',
    request: ReturnType<PerformanceApi['closeout']>,
  ): void {
    this.saving.set(section);
    this.sectionError.set(null);
    this.notice.set('');
    request.subscribe({
      next: (view) => {
        this.saving.set(null);
        this.apply(view, section);
        this.announce(
          section === 'commercial'
            ? $localize`:@@closeout.savedCommercial:Commercial outcome saved.`
            : $localize`:@@closeout.savedExecution:Execution outcome saved.`,
        );
      },
      error: (error: unknown) => {
        this.saving.set(null);
        this.sectionError.set({ section, message: performanceProblemMessage(error) });
        // The disabled form dropped the focus: take it to the explanation.
        setTimeout(() => this.document.getElementById('section-error')?.focus());
      },
    });
  }

  private moneyProblem(problem: string): string {
    switch (problem) {
      case 'decimals':
        return $localize`:@@closeout.moneyDecimals:Use at most ${this.decimals()}:decimals: decimal places.`;
      case 'grouping':
        return $localize`:@@closeout.moneyGrouping:Use a point for decimals, for example 1250000.50.`;
      case 'range':
        return $localize`:@@closeout.moneyRange:The amount is too large.`;
      default:
        return $localize`:@@closeout.moneyFormat:Enter the amount as a plain number, for example 1250000.50.`;
    }
  }

  // ------------------------------------------------------------------ finalize and reopen

  /** CF-036: the project has an assigned Project Manager and it is not the reader. */
  needsNotAssignedConfirmation(view: CloseoutWorkspace): boolean {
    return !!view.assignedProjectManagerName && !view.assignedToYou;
  }

  ask(action: 'finalize' | 'reopen'): void {
    this.error.set('');
    this.notice.set('');
    this.reasonMissing.set(false);
    this.notAssignedMissing.set(false);
    this.timingMissing.set(false);
    // A new action (or a different one) gets a new key and a blank reason; asking again after a failed attempt retries the
    // same one with the reason already written.
    if (this.actionKind !== action || !this.actionKey) {
      this.actionKey = requestKey();
      this.actionKind = action;
      this.reason = '';
      this.notAssignedConfirmed = false;
      this.timingConfirmed = false;
    }
    this.confirming.set(action);
  }

  dismiss(): void {
    if (!this.acting()) this.confirming.set(null);
  }

  confirm(): void {
    const view = this.workspace();
    const action = this.confirming();
    if (!view || !action || !view.version || this.acting()) return;
    if (action === 'reopen' && this.reason.trim().length < REASON_MIN) {
      this.reasonMissing.set(true);
      setTimeout(() => this.document.getElementById('reopen-reason')?.focus());
      return;
    }
    if (
      action === 'finalize' &&
      this.needsNotAssignedConfirmation(view) &&
      !this.notAssignedConfirmed
    ) {
      this.notAssignedMissing.set(true);
      setTimeout(() => this.document.getElementById('not-assigned-confirmed')?.focus());
      return;
    }
    const timing = (view.timingWarnings?.length ?? 0) > 0;
    if (action === 'finalize' && timing && !this.timingConfirmed) {
      this.timingMissing.set(true);
      setTimeout(() => this.document.getElementById('timing-confirmed')?.focus());
      return;
    }
    this.acting.set(true);
    const request =
      action === 'finalize'
        ? this.api.finalize(
            view.awardId,
            view.version,
            this.actionKey,
            this.needsNotAssignedConfirmation(view) && this.notAssignedConfirmed,
            timing && this.timingConfirmed,
          )
        : this.api.reopen(view.awardId, view.version, this.reason, this.actionKey);
    request.subscribe({
      next: (updated) => {
        this.acting.set(false);
        this.confirming.set(null);
        this.actionKey = '';
        this.actionKind = null;
        this.apply(updated, 'both');
        // A replayed request answers with the current state, which may have moved on since (e.g. reopened by a colleague).
        this.announce(
          updated.lifecycle === 'Closed'
            ? $localize`:@@closeout.finalized:The closeout is closed. Version ${updated.currentVersionNumber}:version: is now part of the performance history.`
            : updated.lifecycle === 'Reopened'
              ? $localize`:@@closeout.reopened:The closeout is reopened for correction. It is excluded from the performance history until it is closed again.`
              : '',
        );
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.confirming.set(null);
        const stale = error instanceof HttpErrorResponse && error.status === 409;
        if (stale) this.load();
        this.error.set(performanceProblemMessage(error));
      },
    });
  }

  announce(message: string): void {
    this.notice.set(message);
    if (!message) return;
    setTimeout(() => {
      const current = this.document.activeElement;
      const lost = !current || current === this.document.body || !current.isConnected;
      if (lost && !this.document.querySelector('[aria-modal="true"]'))
        this.document.getElementById('closeout-notice')?.focus();
    });
  }
}

const COUNT_FIELDS = [
  'variationCount',
  'claimCount',
  'unresolvedClaimCount',
  'disputeCount',
  'unresolvedDisputeCount',
] as const;

/** The element each field's problem focuses. */
const FIELD_IDS: Record<string, string> = {
  actualFinalCost: 'money-actualFinalCost',
  costToCompleteByOthers: 'money-costToCompleteByOthers',
  variationValue: 'money-variationValue',
  claimedValue: 'money-claimedValue',
  variationCount: 'field-variations',
  claimCount: 'field-claims',
  unresolvedClaimCount: 'field-unresolved_claims',
  disputeCount: 'field-disputes',
  unresolvedDisputeCount: 'field-unresolved_disputes',
};

function isWholeCount(value: number | string): boolean {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= COUNT_MAX;
}

/** The element a missing completeness item focuses (every key the server can return has one). */
export function missingTarget(key: string): string {
  return key === 'actual_final_cost' ? 'money-actualFinalCost' : `field-${key}`;
}

const EMPTY_COMMERCIAL = {
  actualFinalCost: null,
  costExplanation: null,
  variationCount: null,
  variationValue: null,
  variationCause: null,
  variationNote: null,
  claimCount: null,
  claimedValue: null,
  unresolvedClaimCount: null,
  claimNote: null,
  disputeCount: null,
  unresolvedDisputeCount: null,
  disputeNote: null,
  commercialFeedback: null,
  evidenceNote: null,
  sectionVersion: null,
  updatedAtUtc: null,
  updatedByName: null,
} as const;

const EMPTY_EXECUTION = {
  actualStartDate: null,
  actualCompletionDate: null,
  scheduleExplanation: null,
  mobilization: null,
  mobilizationNote: null,
  qualityRating: null,
  qualityComment: null,
  hseRating: null,
  hseComment: null,
  executionFeedback: null,
  wouldWorkAgain: null,
  wouldWorkAgainRationale: null,
  evidenceNote: null,
  sectionVersion: null,
  updatedAtUtc: null,
  updatedByName: null,
} as const;
