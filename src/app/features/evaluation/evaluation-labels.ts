import { ltr, formatList } from '../../core/localization/labels';
import {
  AdjustmentCategory,
  CriterionCategory,
  EvaluationFlag,
  EvaluationStage,
  LevelingStatus,
  OpenedFileClassification,
  OpeningState,
  ScorecardStatus,
} from './evaluation.api';

// Every evaluation label in one place. Counts in code are label-style ("Exclusions: 3"), so no language needs a
// plural rule here (templates use ICU plurals); identifiers and numbers are isolated left-to-right inside Arabic.

const categoryLabels = (): Record<CriterionCategory, string> => ({
  Technical: $localize`:@@criterionCategory.technical:Technical`,
  Methodology: $localize`:@@criterionCategory.methodology:Methodology`,
  Schedule: $localize`:@@criterionCategory.schedule:Schedule`,
  Resources: $localize`:@@criterionCategory.resources:Resources`,
  Quality: $localize`:@@criterionCategory.quality:Quality`,
  Hse: $localize`:@@criterionCategory.hse:Health, safety and environment`,
  Risk: $localize`:@@criterionCategory.risk:Risk`,
  Other: $localize`:@@criterionCategory.other:Other`,
});

export function criterionCategoryLabel(category: string): string {
  return categoryLabels()[category as CriterionCategory] ?? category;
}

const adjustmentCategoryLabels = (): Record<AdjustmentCategory, string> => ({
  MissingScope: $localize`:@@adjustmentCategory.missingScope:Missing scope`,
  Exclusion: $localize`:@@adjustmentCategory.exclusion:Excluded item`,
  Qualification: $localize`:@@adjustmentCategory.qualification:Qualification`,
  Arithmetic: $localize`:@@adjustmentCategory.arithmetic:Arithmetic correction`,
  ProvisionalSum: $localize`:@@adjustmentCategory.provisionalSum:Provisional sum`,
  Other: $localize`:@@adjustmentCategory.other:Other`,
  VatBasis: $localize`:@@adjustmentCategory.vatBasis:VAT basis (onto the tender's basis)`,
});

export function adjustmentCategoryLabel(category: string): string {
  return adjustmentCategoryLabels()[category as AdjustmentCategory] ?? category;
}

export function stageLabel(stage: EvaluationStage): string {
  return (
    {
      NotOpened: $localize`:@@evaluationStage.notOpened:Bids sealed`,
      NotStarted: $localize`:@@evaluationStage.notStarted:Not started`,
      InProgress: $localize`:@@evaluationStage.inProgress:In progress`,
      Completed: $localize`:@@evaluationStage.completed:Completed`,
    } satisfies Record<EvaluationStage, string>
  )[stage];
}

export function levelingStatusLabel(status: LevelingStatus): string {
  return (
    {
      NotStarted: $localize`:@@levelingStatus.notStarted:Not started`,
      InProgress: $localize`:@@levelingStatus.inProgress:In progress`,
      Completed: $localize`:@@levelingStatus.completed:Completed`,
    } satisfies Record<LevelingStatus, string>
  )[status];
}

export function scorecardStatusLabel(status: ScorecardStatus | null): string {
  if (!status) return $localize`:@@scorecardStatus.none:Not started`;
  return status === 'Submitted'
    ? $localize`:@@scorecardStatus.submitted:Submitted`
    : $localize`:@@scorecardStatus.draft:Draft`;
}

export function classificationLabel(classification: OpenedFileClassification): string {
  return (
    {
      Unclassified: $localize`:@@fileClassification.unclassified:Not classified (commercial readers only)`,
      Technical: $localize`:@@fileClassification.technical:Technical`,
      Commercial: $localize`:@@fileClassification.commercial:Commercial`,
    } satisfies Record<OpenedFileClassification, string>
  )[classification];
}

export function openingStateLabel(state: OpeningState): string {
  return (
    {
      NotPublished: $localize`:@@openingState.notPublished:Not published`,
      Open: $localize`:@@openingState.open:Open — bids sealed`,
      Cancelled: $localize`:@@openingState.cancelled:Cancelled`,
      NoSubmissions: $localize`:@@openingState.noSubmissions:Closed without submissions`,
      Ready: $localize`:@@openingState.readyToOpen:Bidding closed — ready to open bids`,
      Opened: $localize`:@@openingState.opened:Opened`,
    } satisfies Record<OpeningState, string>
  )[state];
}

const optionalFieldLabel = (field: string): string =>
  ({
    paymentTerms: $localize`:@@evaluationField.paymentTerms:payment terms`,
    durationDays: $localize`:@@evaluationField.durationDays:duration`,
    warrantyMonths: $localize`:@@evaluationField.warrantyMonths:warranty`,
    validityDays: $localize`:@@evaluationField.validityDays:validity`,
  })[field] ?? field;

/** A list in the build's language ("a, b and c" / "أ وب وج"). */
function list(items: readonly string[]): string {
  return formatList(items, ($localize as { locale?: string }).locale ?? 'en');
}

/** The explanation of a deterministic flag: what it found and the numbers behind it. */
export function flagLabel(flag: EvaluationFlag): string {
  const p = flag.parameters;
  switch (flag.key) {
    case 'olderTenderRevision':
      return $localize`:@@flag.olderTenderRevision:Answered tender revision ${ltr(p['answered'])}:answered:; the revision in force is ${ltr(p['current'])}:current:.`;
    case 'acknowledgementsOutstanding':
      return $localize`:@@flag.acknowledgementsOutstanding:Required addenda not acknowledged at opening: ${ltr(p['addenda'])}:addenda:.`;
    case 'technicalEvaluationIncomplete':
      return $localize`:@@flag.technicalEvaluationIncomplete:No submitted technical scorecard yet.`;
    case 'scopeDeviations':
      return $localize`:@@flag.scopeDeviations:The bidder states that its bid departs from the scope.`;
    case 'technicalDeviations':
      return $localize`:@@flag.technicalDeviations:Technical deviations stated: ${ltr(p['count'])}:count:.`;
    case 'technicalApproachMissing':
      return $localize`:@@flag.technicalApproachMissing:No technical approach was provided.`;
    case 'filesRestricted':
      return $localize`:@@flag.filesRestricted:Files visible to commercial readers only: ${ltr(p['count'])}:count:.`;
    case 'currencyMismatch':
      return $localize`:@@flag.currencyMismatch:Priced in ${ltr(p['currency'])}:currency:, not the tender currency. Not compared and never converted.`;
    case 'priceAboveMedian':
      return $localize`:@@flag.priceAboveMedian:Leveled total ${ltr(p['percent'])}:percent:% above the median (bids compared: ${ltr(p['bids'])}:bids:; threshold ${ltr(p['threshold'])}:threshold:%).`;
    case 'priceBelowMedian':
      return $localize`:@@flag.priceBelowMedian:Leveled total ${ltr(p['percent'])}:percent:% below the median (bids compared: ${ltr(p['bids'])}:bids:; threshold ${ltr(p['threshold'])}:threshold:%).`;
    case 'durationAboveMedian':
      return $localize`:@@flag.durationAboveMedian:Proposed duration ${ltr(p['percent'])}:percent:% longer than the median (median in days: ${ltr(p['median'])}:median:; threshold ${ltr(p['threshold'])}:threshold:%).`;
    case 'durationBelowMedian':
      return $localize`:@@flag.durationBelowMedian:Proposed duration ${ltr(p['percent'])}:percent:% shorter than the median (median in days: ${ltr(p['median'])}:median:; threshold ${ltr(p['threshold'])}:threshold:%).`;
    case 'exclusions':
      return $localize`:@@flag.exclusions:Exclusions stated: ${ltr(p['count'])}:count:.`;
    case 'commercialDeviations':
      return $localize`:@@flag.commercialDeviations:Commercial deviations stated: ${ltr(p['count'])}:count:.`;
    case 'validityShorter':
      return $localize`:@@flag.validityShorter:Validity offered is shorter than requested (in days: offered ${ltr(p['offered'])}:offered:, requested ${ltr(p['requested'])}:requested:).`;
    case 'optionalInformationMissing':
      return $localize`:@@flag.optionalInformationMissing:Not provided: ${list((p['fields'] ?? '').split(',').map(optionalFieldLabel))}:fields:.`;
    case 'vatBasisMismatch':
      return $localize`:@@flag.vatBasisMismatch:Priced on another VAT basis (${vatTreatmentLabel(p['treatment'])}:treatment:${p['rate'] ? ' ' + ltr(p['rate'] + '%') : ''}:rate:). Not compared until a VAT-basis adjustment brings it onto the tender's basis; nothing is converted.`;
    case 'vatBasisAdjusted':
      return $localize`:@@flag.vatBasisAdjusted:Priced on another VAT basis (${vatTreatmentLabel(p['treatment'])}:treatment:); a VAT-basis adjustment brings it onto the tender's basis. The submitted price is unchanged.`;
    case 'termsDeviation':
      return $localize`:@@flag.termsDeviation:Answers some requested terms differently: ${termFieldsLabel(p['fields'])}:fields:.`;
    case 'missingScope':
      return $localize`:@@flag.missingScope:Missing scope: ${ltr(p['count'])}:count: schedule items in force are not priced in this bid (it answered an earlier revision): ${ltr(p['items'])}:items:.`;
    case 'scheduleQuantityDiffers':
      return $localize`:@@flag.scheduleQuantityDiffers:Priced on other quantities than the schedule in force for ${ltr(p['count'])}:count: items: ${ltr(p['items'])}:items:.`;
    case 'noPriceBreakdown':
      return $localize`:@@flag.noPriceBreakdown:No price breakdown: only a total was submitted.`;
    case 'revisedInRound':
      return $localize`:@@flag.revisedInRound:Revised in negotiation round ${ltr(p['round'])}:round:: the response in force is revision ${ltr(p['revision'])}:revision:.`;
    case 'normalized':
      return $localize`:@@flag.normalized:Leveled by the buyer (active adjustments: ${ltr(p['count'])}:count:; total ${ltr(p['total'])}:total:).`;
    default:
      return flag.key;
  }
}

export function gapLabel(key: string): string {
  return (
    (
      {
        policyRequired: $localize`:@@evaluationGap.policyRequired:Choose the evaluation policy.`,
        technicalScorecardMissing: $localize`:@@evaluationGap.technicalScorecardMissing:A bid has no submitted technical scorecard.`,
        commercialLevelingIncomplete: $localize`:@@evaluationGap.commercialLevelingIncomplete:Commercial leveling is not marked complete.`,
        draftScorecard: $localize`:@@evaluationGap.draftScorecard:A scorecard is still a draft.`,
        score: $localize`:@@evaluationGap.score:Score is missing.`,
        comment: $localize`:@@evaluationGap.comment:A comment is required.`,
        evidence: $localize`:@@evaluationGap.evidence:An evidence reference is required.`,
        negotiationRoundOpen: $localize`:@@evaluationGap.negotiationRoundOpen:A negotiation round is open. Its responses are evaluated once it closes.`,
        vatBasisUnresolved: $localize`:@@evaluationGap.vatBasisUnresolved:A bid is priced on another VAT basis without a VAT-basis adjustment.`,
        panelMinimumNotMet: $localize`:@@evaluationGap.panelMinimumNotMet:A bid has fewer current submitted scorecards than the panel minimum.`,
        moderationRequired: $localize`:@@evaluationGap.moderationRequired:Evaluators' totals for a bid diverge beyond the threshold: record a moderation note.`,
        adjustmentsNotCarried: $localize`:@@evaluationGap.adjustmentsNotCarried:A revised response no longer counts adjustments made on an earlier revision: re-apply each one or confirm it no longer applies.`,
        refreshRequired: $localize`:@@evaluationGap.refreshRequired:A closed negotiation round's responses are not taken into the evaluation yet.`,
        technicalRescoreRequired: $localize`:@@evaluationGap.technicalRescoreRequired:A revised response changed the technical answers: its earlier scorecards no longer count, so it needs a new submitted scorecard.`,
      } as Record<string, string>
    )[key] ?? key
  );
}

export function scoreBlockedLabel(reason: string | null): string {
  switch (reason) {
    case 'blind_scoring_required':
      return $localize`:@@scoreBlocked.blind:This evaluation's policy requires commercial-blind technical scoring, and you can see prices. Technical evaluators score it.`;
    case 'not_started':
      return $localize`:@@scoreBlocked.notStarted:Scoring starts once a manager chooses the evaluation policy.`;
    case 'completed':
      return $localize`:@@scoreBlocked.completed:The evaluation is complete; scores are read-only.`;
    case 'tender_cancelled':
      return $localize`:@@scoreBlocked.cancelled:The tender was cancelled; the evaluation is read-only.`;
    case 'tender_awarded':
      return $localize`:@@scoreBlocked.awarded:The tender was awarded; the evaluation evidence is frozen.`;
    default:
      return $localize`:@@scoreBlocked.noPermission:You can read the technical evidence; scoring is for technical evaluators.`;
  }
}

/** CF-055 (ADR-092): a VAT treatment in words. */
export function vatTreatmentLabel(treatment: string | null | undefined): string {
  switch (treatment) {
    case 'ExclusiveOfVat':
      return $localize`:@@vat.exclusive:Exclusive of VAT`;
    case 'InclusiveOfVat':
      return $localize`:@@vat.inclusive:Inclusive of VAT`;
    case 'NotApplicable':
      return $localize`:@@vat.notApplicable:VAT does not apply`;
    default:
      return '—';
  }
}

/** CF-055: the requested terms a bid answered differently, in words. */
export function termFieldsLabel(fields: string | undefined): string {
  const names: Record<string, string> = {
    retention: $localize`:@@terms.retention:Retention`,
    advancePayment: $localize`:@@terms.advancePayment:Advance payment`,
    performanceSecurity: $localize`:@@terms.performanceSecurity:Performance security`,
    bidBond: $localize`:@@terms.bidBond:Bid bond`,
  };
  return (fields ?? '')
    .split(',')
    .filter((field) => field)
    .map((field) => names[field] ?? field)
    .join(', ');
}
