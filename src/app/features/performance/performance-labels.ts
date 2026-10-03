import { money } from '../evaluation/evaluation-format';
import {
  CloseoutEventKind,
  CloseoutLifecycle,
  CloseoutOutcomeType,
  TimingWarning,
  MobilizationOutcome,
  ScheduleOutcome,
  VariationCause,
  WouldWorkAgain,
} from './performance.api';

// Every Part 11 label in one place. Ratings are the company's own internal scale (never a certification); a variance is always
// said in words with its sign and direction, never by colour alone; numbers and codes are isolated left-to-right in Arabic by
// the templates.

export function lifecycleLabel(lifecycle: CloseoutLifecycle | string): string {
  switch (lifecycle) {
    case 'Pending':
      return $localize`:@@performance.lifecyclePending:Closeout pending`;
    case 'InProgress':
      return $localize`:@@performance.lifecycleInProgress:Closeout in progress`;
    case 'Reopened':
      return $localize`:@@performance.lifecycleReopened:Reopened for correction`;
    default:
      return $localize`:@@performance.lifecycleFinalized:Closeout finalized`;
  }
}

/** The company's internal 1–5 scale (ADR-072), with its meaning next to the number. */
export function ratingLabel(rating: number | null | undefined): string {
  switch (rating) {
    case 1:
      return $localize`:@@performance.rating1:1 — Unacceptable`;
    case 2:
      return $localize`:@@performance.rating2:2 — Below expectations`;
    case 3:
      return $localize`:@@performance.rating3:3 — Acceptable`;
    case 4:
      return $localize`:@@performance.rating4:4 — Good`;
    case 5:
      return $localize`:@@performance.rating5:5 — Excellent`;
    default:
      return $localize`:@@performance.notRecorded:Not recorded`;
  }
}

export function mobilizationLabel(
  outcome: MobilizationOutcome | string | null | undefined,
): string {
  switch (outcome) {
    case 'AsPlanned':
      return $localize`:@@performance.mobilizationAsPlanned:Mobilized as planned`;
    case 'MinorDelay':
      return $localize`:@@performance.mobilizationMinorDelay:Minor mobilization delay`;
    case 'MajorDelay':
      return $localize`:@@performance.mobilizationMajorDelay:Major mobilization delay`;
    case 'NotApplicable':
      return $localize`:@@performance.mobilizationNotApplicable:Not applicable`;
    default:
      return $localize`:@@performance.notRecorded:Not recorded`;
  }
}

export function rehireLabel(choice: WouldWorkAgain | string | null | undefined): string {
  switch (choice) {
    case 'Yes':
      return $localize`:@@performance.rehireYes:Yes — would work with them again`;
    case 'Conditional':
      return $localize`:@@performance.rehireConditional:Conditional — only under stated conditions`;
    case 'No':
      return $localize`:@@performance.rehireNo:No — would not work with them again`;
    default:
      return $localize`:@@performance.notRecorded:Not recorded`;
  }
}

/** Short form for lists and history cards. */
export function rehireShortLabel(choice: WouldWorkAgain | string | null | undefined): string {
  switch (choice) {
    case 'Yes':
      return $localize`:@@performance.rehireShortYes:Would work again`;
    case 'Conditional':
      return $localize`:@@performance.rehireShortConditional:Conditional`;
    case 'No':
      return $localize`:@@performance.rehireShortNo:Would not work again`;
    default:
      return $localize`:@@performance.notRecorded:Not recorded`;
  }
}

export function variationCauseLabel(cause: VariationCause | string | null | undefined): string {
  switch (cause) {
    case 'ClientChange':
      return $localize`:@@performance.causeClientChange:Client change`;
    case 'DesignChange':
      return $localize`:@@performance.causeDesignChange:Design change`;
    case 'ScopeGap':
      return $localize`:@@performance.causeScopeGap:Scope gap or exclusion`;
    case 'SiteCondition':
      return $localize`:@@performance.causeSiteCondition:Site condition`;
    case 'Other':
      return $localize`:@@performance.causeOther:Other`;
    default:
      return $localize`:@@performance.causeNone:Not stated`;
  }
}

export function scheduleOutcomeLabel(outcome: ScheduleOutcome | string | null | undefined): string {
  switch (outcome) {
    case 'WithinDuration':
      return $localize`:@@performance.scheduleWithin:Within the awarded duration`;
    case 'Late':
      return $localize`:@@performance.scheduleLate:Longer than the awarded duration`;
    case 'NoBaseline':
      return $localize`:@@performance.scheduleNoBaseline:No awarded duration to compare with`;
    default:
      return $localize`:@@performance.notRecorded:Not recorded`;
  }
}

export function eventLabel(kind: CloseoutEventKind | string, version: number): string {
  switch (kind) {
    case 'Started':
      return $localize`:@@performance.eventStarted:Closeout started`;
    case 'Finalized':
      return $localize`:@@performance.eventFinalized:Finalized as version ${version}:version:`;
    default:
      return $localize`:@@performance.eventReopened:Version ${version}:version: reopened for correction`;
  }
}

/** The name of a missing completeness item, as the form calls it. */
export function missingLabel(key: string): string {
  switch (key) {
    case 'actual_final_cost':
      return $localize`:@@performance.missingFinalCost:Actual final cost`;
    case 'cost_explanation':
      return $localize`:@@performance.missingCostExplanation:Why the final cost exceeds the award value`;
    case 'actual_start_date':
      return $localize`:@@performance.missingStart:Actual start date`;
    case 'actual_completion_date':
      return $localize`:@@performance.missingCompletion:Actual completion date`;
    case 'schedule_explanation':
      return $localize`:@@performance.missingScheduleExplanation:Why the work took longer than awarded`;
    case 'quality_rating':
      return $localize`:@@performance.missingQuality:Quality rating`;
    case 'quality_comment':
      return $localize`:@@performance.missingQualityComment:Comment on the low quality rating`;
    case 'hse_rating':
      return $localize`:@@performance.missingHse:HSE / safety rating`;
    case 'hse_comment':
      return $localize`:@@performance.missingHseComment:Comment on the low HSE rating`;
    case 'variations':
      return $localize`:@@performance.missingVariations:Variations (enter 0 if none)`;
    case 'claims':
      return $localize`:@@performance.missingClaims:Claims (enter 0 if none)`;
    case 'disputes':
      return $localize`:@@performance.missingDisputes:Disputes (enter 0 if none)`;
    case 'unresolved_claims':
      return $localize`:@@performance.missingUnresolvedClaims:How many claims remain unresolved`;
    case 'unresolved_disputes':
      return $localize`:@@performance.missingUnresolvedDisputes:How many disputes remain unresolved`;
    case 'would_work_again':
      return $localize`:@@performance.missingRehire:Would-work-again decision`;
    case 'would_work_again_rationale':
      return $localize`:@@performance.missingRehireRationale:Rationale for the would-work-again decision`;
    case 'outcome_type':
      return $localize`:@@performance.missingOutcomeType:How the subcontract ended`;
    case 'award_value':
      return $localize`:@@performance.missingAwardValue:Awarded value`;
    case 'early_works_declaration':
      return $localize`:@@performance.missingEarlyWorks:Declaration of works before the award`;
    default:
      return key;
  }
}

/** Which form step a missing item is recorded on. */
export function missingStep(
  key: string,
): 'schedule' | 'commercial' | 'quality' | 'issues' | 'feedback' {
  if (key.startsWith('actual_final') || key === 'cost_explanation') return 'commercial';
  if (
    key.startsWith('actual_') ||
    key === 'schedule_explanation' ||
    key === 'outcome_type' ||
    key === 'early_works_declaration'
  )
    return 'schedule';
  if (key.startsWith('quality') || key.startsWith('hse')) return 'quality';
  if (
    ['variations', 'claims', 'disputes', 'unresolved_claims', 'unresolved_disputes'].includes(key)
  )
    return 'issues';
  return 'feedback';
}

/** CF-002 (ADR-126): the label every surface puts on a retrospective outcome. */
export function retrospectiveBadge(): string {
  return $localize`:@@retrospective.badge:Retrospective — not system-evidenced`;
}

export function retrospectiveStatusLabel(status: string): string {
  switch (status) {
    case 'Confirmed':
      return $localize`:@@retrospective.statusConfirmed:Confirmed`;
    case 'Correcting':
      return $localize`:@@retrospective.statusCorrecting:Being corrected`;
    default:
      return $localize`:@@retrospective.statusDraft:Awaiting confirmation`;
  }
}

export function retrospectiveEventLabel(kind: string, version: number): string {
  switch (kind) {
    case 'Confirmed':
      return $localize`:@@retrospective.eventConfirmed:Confirmed as version ${version}:version:`;
    case 'CorrectionStarted':
      return $localize`:@@retrospective.eventCorrection:Version ${version}:version: opened for correction`;
    default:
      return $localize`:@@retrospective.eventCreated:Recorded`;
  }
}

/** CF-048 (ADR-124): how a subcontract ended. */
export function outcomeTypeLabel(outcome: CloseoutOutcomeType | string | null | undefined): string {
  switch (outcome) {
    case 'TerminatedForDefault':
      return $localize`:@@performance.outcomeTerminatedForDefault:Terminated for default`;
    case 'TerminatedForConvenience':
      return $localize`:@@performance.outcomeTerminatedForConvenience:Terminated for convenience`;
    case 'Abandoned':
      return $localize`:@@performance.outcomeAbandoned:Abandoned by the subcontractor`;
    case 'Descoped':
      return $localize`:@@performance.outcomeDescoped:Descoped`;
    case 'CompletedByOthers':
      return $localize`:@@performance.outcomeCompletedByOthers:Completed by others`;
    default:
      return $localize`:@@performance.outcomeCompleted:Completed`;
  }
}

/** CF-048: what the outcome means for comparisons with the award. */
export function outcomeEffectLabel(
  outcome: CloseoutOutcomeType | string | null | undefined,
): string {
  switch (outcome) {
    case 'TerminatedForDefault':
    case 'Abandoned':
      return $localize`:@@performance.outcomeEffectNegative:A negative outcome: cost and time are never counted as favourable.`;
    case 'TerminatedForConvenience':
    case 'Descoped':
    case 'CompletedByOthers':
      return $localize`:@@performance.outcomeEffectNotComparable:Not comparable: cost and time are left out of the history's variances.`;
    default:
      return $localize`:@@performance.outcomeEffectCompleted:Cost and time are compared with the award.`;
  }
}

/** CF-082: a timing warning the finalizer confirmed. */
export function timingWarningLabel(warning: TimingWarning | string): string {
  switch (warning) {
    case 'finalized_soon':
      return $localize`:@@performance.timingFinalizedSoon:Finalized less than 7 days after the award`;
    case 'short_duration':
      return $localize`:@@performance.timingShortDuration:Actual duration below 10 % of the awarded duration`;
    default:
      return warning;
  }
}

/** "+11.00 %", "−10.00 %" or "0.00 %"; null stays "—". The minus sign is the typographic one. */
export function signedPercent(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.startsWith('-')) return `−${value.slice(1)} %`;
  return /^0(\.0+)?$/.test(value) ? `${value} %` : `+${value} %`;
}

export function signedDays(days: number | null | undefined): string {
  if (days === null || days === undefined) return '—';
  return days > 0 ? `+${days}` : days < 0 ? `−${-days}` : '0';
}

/** A signed money amount with grouping: "+110,000.00" / "−50,000.00". */
export function signedAmount(amount: string | null | undefined, locale: string): string {
  if (!amount) return '—';
  const negative = amount.startsWith('-');
  const grouped = money(negative ? amount.slice(1) : amount, locale);
  if (/^0+(\.0+)?$/.test(negative ? amount.slice(1) : amount)) return grouped;
  return negative ? `−${grouped}` : `+${grouped}`;
}

export type VarianceDirection = 'over' | 'under' | 'even' | 'none';

export function direction(value: string | number | null | undefined): VarianceDirection {
  if (value === null || value === undefined || value === '') return 'none';
  const text = String(value);
  if (/^-?0+(\.0+)?$/.test(text)) return 'even';
  return text.startsWith('-') ? 'under' : 'over';
}

/** What a cost variance means, in words. */
export function costDirectionLabel(value: string | null | undefined): string {
  switch (direction(value)) {
    case 'over':
      return $localize`:@@performance.costOver:Over the award value`;
    case 'under':
      return $localize`:@@performance.costUnder:Below the award value`;
    case 'even':
      return $localize`:@@performance.costEven:Equal to the award value`;
    default:
      return $localize`:@@performance.noComparison:No comparison possible`;
  }
}

export function durationDirectionLabel(value: string | null | undefined): string {
  switch (direction(value)) {
    case 'over':
      return $localize`:@@performance.durationOver:Longer than awarded`;
    case 'under':
      return $localize`:@@performance.durationUnder:Faster than awarded`;
    case 'even':
      return $localize`:@@performance.durationEven:Exactly as awarded`;
    default:
      return $localize`:@@performance.noComparison:No comparison possible`;
  }
}

export function categoryLabel(category: string | null | undefined): string {
  return category?.trim() || $localize`:@@performance.noCategory:No category`;
}
