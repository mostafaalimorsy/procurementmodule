import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { formatAmount, parseMoney } from '../../core/localization/money';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { compareAmounts, money } from '../evaluation/evaluation-format';
import { isStale } from '../tendering/tendering.api';
import {
  COMPETITION_JUSTIFICATIONS,
  CompetitionJustification,
  DECISION_REASON_MAX,
  DECISION_REASON_MIN,
  DecisionApi,
  DecisionInput,
  DecisionWorkspace,
  RATIONALE_MAX,
  RecommendationCandidate,
  decisionProblemMessage,
  readsApprovalRoutes,
} from './decision.api';
import { exceedsEstimate } from './decision-controls';
import {
  approverRoleLabel,
  competitionJustificationLabel,
  ineligibleReasonLabel,
} from './decision-labels';
import { RequestKeys } from './request-keys';
import { ShortlistBasisNote } from './shortlist-basis';

interface DispositionForm {
  disposition: 'Reserve' | 'Reject';
  reserveRank: string;
  reason: string;
}

interface DecisionForm {
  proposed: string;
  overrideReason: string;
  awardValue: string;
  valueReason: string;
  rationale: string;
  dispositions: Record<string, DispositionForm>;
  competitionCategory: CompetitionJustification | '';
  competitionReason: string;
  overBudgetReason: string;
  revisionAcknowledgementReason: string;
}

/**
 * Preparing the decision (Part 10): the proposed firm among the eligible bids, an override reason whenever it is not ranked
 * first by the recommendation, the award value (a decimal string, prefilled with the proposed bid's leveled total) with a
 * reason when it differs, the rationale, and what happens to every other bid — kept in reserve in order, or not selected.
 * With limited competition (CF-038) the decision says why it stands; above the estimate beyond the company's tolerance
 * (CF-037) it says why and an Approver/Director approves it.
 * Saving keeps a draft; submitting sends that exact draft on its approval route. Nothing here awards.
 */
@Component({
  selector: 'app-decision-prepare',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    BusinessDatePipe,
    ConfirmDialog,
    RouterLink,
    ShortlistBasisNote,
  ],
  templateUrl: './decision-prepare.html',
  styleUrl: './decision-prepare.scss',
})
export class DecisionPrepare {
  private readonly api = inject(DecisionApi);
  private readonly keys = inject(RequestKeys);
  readonly locale = inject(LocaleService).locale;
  /** CF-136: the approval routes page is open to approvers and submitters (the route guard decides again). */
  readonly readsRules = readsApprovalRoutes(inject(SessionService));
  readonly tenderId = input.required<string>();
  readonly workspace = input.required<DecisionWorkspace>();
  readonly updated = output<DecisionWorkspace>();
  readonly announce = output<string>();
  readonly reload = output<string>();

  readonly reasonMax = DECISION_REASON_MAX;
  readonly rationaleMax = RATIONALE_MAX;
  readonly roleLabel = approverRoleLabel;
  readonly ineligibleLabel = ineligibleReasonLabel;
  readonly justifications = COMPETITION_JUSTIFICATIONS;
  readonly justificationLabel = competitionJustificationLabel;

  readonly busy = signal(false);
  readonly error = signal('');
  readonly dirty = signal(false);
  readonly confirming = signal(false);
  readonly confirmError = signal('');
  form: DecisionForm = blank();
  private readonly revision = signal(0);
  private formKey = '';

  readonly recommendation = computed(() => this.workspace().recommendation);
  readonly fresh = computed(() => {
    const state = this.recommendation()?.liveState;
    return state === 'Ready' || state === 'InsufficientHistory';
  });
  readonly status = computed(() => this.workspace().status);
  readonly editable = computed(
    () =>
      this.workspace().access.prepare &&
      (this.status() === null || this.status() === 'Draft') &&
      !!this.recommendation() &&
      this.fresh(),
  );
  readonly eligible = computed(() =>
    (this.recommendation()?.candidates ?? []).filter((candidate) => candidate.eligible),
  );
  /** Red-team G076 (CF-046): the firms whose award on this tender was declined or withdrawn — they cannot be proposed again. */
  readonly previousAwardees = computed(() => previousAwardeeCodes(this.workspace()));
  /** The first rank as the server judges it (ADR-172): over the eligible bids, leaving previous awardees out. */
  readonly topRanked = computed(() => topRankedIds(this.workspace()));
  /** Without the override right, only a firm ranked first may be proposed; previous awardees are listed, disabled. */
  readonly choices = computed(() =>
    this.eligible().filter(
      (candidate) =>
        this.workspace().access.override ||
        this.topRanked().has(candidate.openingBidId) ||
        this.isPreviousAwardee(candidate),
    ),
  );
  /** The previous awardees among the eligible bids, named in the note under the choice. */
  readonly excluded = computed(() =>
    this.eligible().filter((candidate) => this.isPreviousAwardee(candidate)),
  );
  /** Red-team G076 (CF-046 AC3): the server's suggestion after a released award, when it is a bid that may be proposed. */
  readonly suggestion = computed(() => {
    const suggestion = this.workspace().promotionSuggestion;
    const candidate = suggestion
      ? this.eligible().find((item) => item.openingBidId === suggestion.openingBidId)
      : undefined;
    return suggestion && candidate && !this.isPreviousAwardee(candidate)
      ? { source: suggestion.source, candidate }
      : null;
  });
  readonly proposed = computed<RecommendationCandidate | null>(() => {
    this.revision();
    return (
      this.eligible().find((candidate) => candidate.openingBidId === this.form.proposed) ?? null
    );
  });
  readonly others = computed(() => {
    this.revision();
    return (this.recommendation()?.candidates ?? []).filter(
      (candidate) => candidate.openingBidId !== this.form.proposed,
    );
  });
  /** ADR-172: an override is a proposed bid that is not the top-ranked eligible bid once previous awardees are left out. */
  readonly isOverride = computed(() => {
    const candidate = this.proposed();
    return !!candidate && !this.topRanked().has(candidate.openingBidId);
  });
  readonly decimals = computed(() => decimalsOf(this.proposed()?.leveledTotal ?? null));
  readonly currency = computed(() => this.recommendation()?.currency ?? this.workspace().currency);
  readonly parsedValue = computed(() => {
    this.revision();
    return parseMoney(this.form.awardValue, this.decimals());
  });
  readonly valueDiffers = computed(() => {
    const value = this.parsedValue().value;
    const leveled = this.proposed()?.leveledTotal;
    return !!value && !!leveled && compareAmounts(value, leveled) !== 0;
  });

  /** CF-038: fewer compliant bids than the minimum snapshotted on the recommendation. */
  readonly limited = computed(() => !!this.recommendation()?.limitedCompetition);
  /** CF-037: judged here as on the server, in the estimate's own currency only; the server decides again on submission. */
  readonly overBudget = computed(() => {
    const controls = this.workspace().controls;
    const value = this.parsedValue().value;
    if (!controls?.estimate || controls.estimateCurrency !== this.currency() || !value)
      return false;
    return exceedsEstimate(value, controls.estimate, controls.overBudgetTolerancePercent);
  });

  /** CF-045 (ADR-099): the proposed bid answered an older tender revision (or left an acknowledgement outstanding). */
  readonly staleRevision = computed(() =>
    (this.proposed()?.flags ?? []).some(
      (flag) => flag === 'older_tender_revision' || flag === 'outstanding_acknowledgements',
    ),
  );

  constructor() {
    // The form follows the saved decision: it is reset when the decision (or its recommendation) changes on the server.
    effect(() => {
      const view = this.workspace();
      const key = `${view.decisionVersion ?? ''}|${view.recommendation?.id ?? ''}`;
      untracked(() => {
        if (key === this.formKey) return;
        this.formKey = key;
        this.form = this.fromWorkspace(view);
        this.dirty.set(false);
        this.revision.update((value) => value + 1);
      });
    });
  }

  isPreviousAwardee(candidate: RecommendationCandidate): boolean {
    return this.previousAwardees().has(candidate.subcontractorCode);
  }

  edited(): void {
    this.dirty.set(true);
    this.error.set('');
    this.revision.update((value) => value + 1);
  }

  pickProposed(id: string): void {
    const previous = this.proposed();
    this.form.proposed = id;
    const next = this.eligible().find((candidate) => candidate.openingBidId === id);
    // The value that needs no reason is the proposed bid's leveled total: follow it unless it was changed by hand.
    const typed = parseMoney(
      this.form.awardValue,
      decimalsOf(previous?.leveledTotal ?? null),
    ).value;
    if (next && (!this.form.awardValue.trim() || (previous && typed === previous.leveledTotal)))
      this.form.awardValue = this.shownAmount(next.leveledTotal);
    delete this.form.dispositions[id];
    if (previous && !this.form.dispositions[previous.openingBidId])
      this.form.dispositions[previous.openingBidId] = notSelected();
    this.edited();
  }

  /** Every bid other than the proposed one has a choice from the moment the form is built (see fromWorkspace). */
  disposition(id: string): DispositionForm {
    return this.form.dispositions[id];
  }

  tidyValue(): void {
    const parsed = this.parsedValue();
    if (parsed.value) this.form.awardValue = this.shownAmount(parsed.value);
    this.revision.update((value) => value + 1);
  }

  save(): void {
    if (this.busy() || !this.editable()) return;
    const problem = this.problem(false);
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api
      .saveDecision(this.tenderId(), this.input(), this.workspace().decisionVersion)
      .subscribe({
        next: (view) => {
          this.busy.set(false);
          this.dirty.set(false);
          this.formKey = '';
          this.updated.emit(view);
          this.announce.emit(
            $localize`:@@decision.saved:Decision draft saved. It is not submitted and nothing is awarded.`,
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (isStale(error)) this.reload.emit(this.staleText());
          else this.error.set(decisionProblemMessage(error));
        },
      });
  }

  startSubmit(): void {
    if (!this.editable()) return;
    if (this.dirty()) {
      this.error.set(
        $localize`:@@decision.saveFirst:Save the draft first: approvers receive exactly the saved version.`,
      );
      return;
    }
    const problem = this.problem(true);
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.confirmError.set('');
    this.confirming.set(true);
  }

  confirmSubmit(): void {
    const version = this.workspace().decisionVersion;
    if (this.busy() || !version) return;
    this.busy.set(true);
    // Kept with the page for this saved version: a retry, even after a tab switch, repeats the same submission.
    const scope = `submit:${version}`;
    this.api.submitDecision(this.tenderId(), version, this.keys.for(scope)).subscribe({
      next: (view) => {
        this.busy.set(false);
        this.confirming.set(false);
        this.keys.done(scope);
        this.updated.emit(view);
        this.announce.emit(
          view.status === 'Approved'
            ? $localize`:@@decision.submittedNoApproval:Decision submitted. Its route needs no approval, so it is approved; the award is issued separately.`
            : $localize`:@@decision.submitted:Decision submitted for approval. Approvers act on this exact version.`,
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error)) {
          this.confirming.set(false);
          this.reload.emit(this.staleText());
        } else this.confirmError.set(decisionProblemMessage(error));
      },
    });
  }

  money(amount: string | null | undefined): string {
    return money(amount, this.locale);
  }

  /** What is wrong before sending: formats always; completeness only for a submission (the server checks both again). */
  private problem(complete: boolean): string {
    const parsed = this.parsedValue();
    if (parsed.problem)
      return $localize`:@@decision.valueInvalid:Enter the award value as digits with at most ${this.decimals()}:decimals: decimal places, for example 1250000.50 (no currency sign).`;
    for (const candidate of this.others()) {
      const choice = this.form.dispositions[candidate.openingBidId];
      if (choice?.disposition === 'Reserve' && !/^\d{1,2}$/.test(choice.reserveRank.trim()))
        return $localize`:@@decision.reserveOrderInvalid:Give each reserve bid its order (1, 2, 3 …).`;
    }
    if (!complete) return '';
    if (!this.proposed())
      return $localize`:@@decision.proposedRequired:Choose the firm proposed for award.`;
    if (this.isPreviousAwardee(this.proposed()!))
      return $localize`:@@decision.previousAwardeeChosen:This firm's award on this tender was declined or withdrawn. Propose another firm.`;
    if (this.isOverride() && !this.workspace().access.override)
      return $localize`:@@decision.overrideNotPermitted:Only people with the override right may propose a firm that is not ranked first.`;
    if (this.isOverride() && this.form.overrideReason.trim().length < DECISION_REASON_MIN)
      return $localize`:@@decision.overrideReasonRequired:Explain why a firm not ranked first is proposed (at least ${DECISION_REASON_MIN}:min: characters).`;
    if (!parsed.value) return $localize`:@@decision.valueRequired:Enter the award value.`;
    if (this.valueDiffers() && this.form.valueReason.trim().length < DECISION_REASON_MIN)
      return $localize`:@@decision.valueReasonRequired:Explain why the award value differs from the leveled total (at least ${DECISION_REASON_MIN}:min: characters).`;
    const ranks = this.others()
      .map((candidate) => this.form.dispositions[candidate.openingBidId])
      .filter((choice) => choice?.disposition === 'Reserve')
      .map((choice) => Number(choice.reserveRank.trim()))
      .sort((a, b) => a - b);
    if (ranks.some((rank, index) => rank !== index + 1))
      return $localize`:@@decision.reserveOrderSequence:Reserve orders must be 1, 2, 3 … with no gaps or repeats.`;
    if (this.limited() && !this.form.competitionCategory)
      return $localize`:@@decision.competitionCategoryRequired:Choose why the decision stands with limited competition.`;
    if (this.limited() && this.form.competitionReason.trim().length < DECISION_REASON_MIN)
      return $localize`:@@decision.competitionReasonRequired:Explain why the decision stands with limited competition (at least ${DECISION_REASON_MIN}:min: characters).`;
    if (this.overBudget() && this.form.overBudgetReason.trim().length < DECISION_REASON_MIN)
      return $localize`:@@decision.overBudgetReasonRequired:Explain why the award value is above the estimate (at least ${DECISION_REASON_MIN}:min: characters).`;
    if (
      this.staleRevision() &&
      this.form.revisionAcknowledgementReason.trim().length < DECISION_REASON_MIN
    )
      return $localize`:@@decision.revisionAcknowledgementMissing:Say why the decision stands on a bid that answered an earlier tender revision (at least ${DECISION_REASON_MIN}:min: characters).`;
    return '';
  }

  private input(): DecisionInput {
    const text = (value: string) => value.trim() || null;
    return {
      recommendationId: this.recommendation()?.id ?? null,
      proposedOpeningBidId: this.form.proposed || null,
      overrideReason: this.isOverride() ? text(this.form.overrideReason) : null,
      awardValue: this.parsedValue().value,
      valueReason: this.valueDiffers() ? text(this.form.valueReason) : null,
      rationale: text(this.form.rationale),
      dispositions: this.others().map((candidate) => {
        const choice = this.disposition(candidate.openingBidId);
        const reserve = choice.disposition === 'Reserve' && candidate.eligible;
        return {
          openingBidId: candidate.openingBidId,
          disposition: reserve ? 'Reserve' : 'Reject',
          reserveRank: reserve ? Number(choice.reserveRank.trim()) : null,
          reason: reserve ? null : text(choice.reason),
        };
      }),
      competitionCategory: this.limited() ? this.form.competitionCategory || null : null,
      competitionReason: this.limited() ? text(this.form.competitionReason) : null,
      overBudgetReason: this.overBudget() ? text(this.form.overBudgetReason) : null,
      revisionAcknowledgementReason: this.staleRevision()
        ? text(this.form.revisionAcknowledgementReason)
        : null,
    };
  }

  private fromWorkspace(view: DecisionWorkspace): DecisionForm {
    const recommendation = view.recommendation;
    const draft = view.draft?.recommendationId === recommendation?.id ? view.draft : null;
    // Red-team G076 (CF-046 AC3): after a released award, the server's suggestion, else the first rank without previous awardees.
    const previous = previousAwardeeCodes(view);
    const suggested = recommendation?.candidates.find(
      (c) =>
        c.openingBidId === view.promotionSuggestion?.openingBidId &&
        c.eligible &&
        !previous.has(c.subcontractorCode),
    );
    const top = topRankedIds(view);
    const first = recommendation?.candidates.find((c) => top.has(c.openingBidId)) ?? null;
    const proposedId =
      draft?.proposedOpeningBidId ?? suggested?.openingBidId ?? first?.openingBidId ?? '';
    const proposed = recommendation?.candidates.find((c) => c.openingBidId === proposedId);
    const value = draft?.awardValue ?? draft?.suggestedAwardValue ?? proposed?.leveledTotal ?? null;
    const dispositions: Record<string, DispositionForm> = {};
    for (const candidate of recommendation?.candidates ?? [])
      if (candidate.openingBidId !== proposedId)
        dispositions[candidate.openingBidId] = notSelected();
    for (const choice of draft?.dispositions ?? [])
      if (choice.disposition !== 'Award')
        dispositions[choice.openingBidId] = {
          disposition: choice.disposition,
          reserveRank: choice.reserveRank?.toString() ?? '',
          reason: choice.reason ?? '',
        };
    return {
      proposed: proposedId,
      overrideReason: draft?.overrideReason ?? '',
      awardValue: value ? formatAmount(value, decimalsOf(value), this.locale) : '',
      valueReason: draft?.valueReason ?? '',
      rationale: draft?.rationale ?? '',
      dispositions,
      competitionCategory: draft?.competitionCategory ?? '',
      competitionReason: draft?.competitionReason ?? '',
      overBudgetReason: draft?.overBudgetReason ?? '',
      revisionAcknowledgementReason: draft?.revisionAcknowledgementReason ?? '',
    };
  }

  private shownAmount(value: string): string {
    return formatAmount(value, decimalsOf(value), this.locale);
  }

  private staleText(): string {
    return $localize`:@@decision.stale:Someone else changed this decision. The latest version is shown; check it and try again.`;
  }
}

/**
 * Red-team G076 (CF-046): the firms of the tender's awards that ended — every earlier award (each was declined or withdrawn) and the latest
 * one when it was declined or withdrawn too. A firm bids once per tender, so its code names its bid.
 */
function previousAwardeeCodes(view: DecisionWorkspace): ReadonlySet<string> {
  const codes = new Set((view.previousAwards ?? []).map((award) => award.subcontractorCode));
  const state = view.award?.state;
  if (view.award && (state === 'Declined' || state === 'Withdrawn'))
    codes.add(view.award.subcontractorCode);
  return codes;
}

/**
 * The bids ranked first, as `AwardDecision.IsTopRanked` judges them (ADR-172): the eligible bids with the best rank once previous
 * awardees are left out — so after a released award the next-ranked firm needs no override, and a lower one still does.
 */
function topRankedIds(view: DecisionWorkspace): ReadonlySet<string> {
  const previous = previousAwardeeCodes(view);
  const remaining = (view.recommendation?.candidates ?? []).filter(
    (candidate) =>
      candidate.eligible && candidate.rank !== null && !previous.has(candidate.subcontractorCode),
  );
  if (!previous.size)
    return new Set(remaining.filter((c) => c.rank === 1).map((c) => c.openingBidId));
  const best = Math.min(...remaining.map((candidate) => candidate.rank!));
  return new Set(remaining.filter((c) => c.rank === best).map((c) => c.openingBidId));
}

function notSelected(): DispositionForm {
  return { disposition: 'Reject', reserveRank: '', reason: '' };
}

function blank(): DecisionForm {
  return {
    proposed: '',
    overrideReason: '',
    awardValue: '',
    valueReason: '',
    rationale: '',
    dispositions: {},
    competitionCategory: '',
    competitionReason: '',
    overBudgetReason: '',
    revisionAcknowledgementReason: '',
  };
}

/** The decimal places of a canonical amount ("1900000.00" → 2); the currency's own, as the server formats it. */
function decimalsOf(amount: string | null): number {
  if (!amount || !amount.includes('.')) return amount ? 0 : 2;
  return amount.split('.')[1].length;
}
