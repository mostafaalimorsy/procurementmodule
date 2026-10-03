import {
  EvidenceStrength,
  ParticipationOutcome,
  SampleSummary,
  SimilarityReason,
} from './intelligence.api';

// Every Part 12 label in one place. A metric is always said with its evidence count; missing evidence reads as "no evidence",
// never as zero; numbers are isolated left-to-right by the templates; nothing here speaks of prediction or probability.

export function strengthLabel(strength: EvidenceStrength | string): string {
  switch (strength) {
    case 'Limited':
      return $localize`:@@intel.strengthLimited:Limited evidence`;
    case 'Moderate':
      return $localize`:@@intel.strengthModerate:Moderate evidence`;
    case 'Strong':
      return $localize`:@@intel.strengthStrong:Strong evidence`;
    default:
      return $localize`:@@intel.strengthNone:No evidence yet`;
  }
}

export function outcomeLabel(outcome: ParticipationOutcome | string): string {
  switch (outcome) {
    case 'Open':
      return $localize`:@@intel.outcomeOpen:Bidding still open`;
    case 'Revoked':
      return $localize`:@@intel.outcomeRevoked:Invitation withdrawn`;
    case 'Cancelled':
      return $localize`:@@intel.outcomeCancelled:Tender cancelled before closing`;
    case 'Submitted':
      return $localize`:@@intel.outcomeSubmitted:Bid submitted`;
    case 'Declined':
      return $localize`:@@intel.outcomeDeclined:Declined`;
    default:
      return $localize`:@@intel.outcomeNoResponse:No response`;
  }
}

export function reasonLabel(reason: SimilarityReason | string): string {
  switch (reason) {
    case 'SameCategory':
      return $localize`:@@intel.reasonCategory:Same category`;
    case 'SameProject':
      return $localize`:@@intel.reasonProject:Same project`;
    default:
      return $localize`:@@intel.reasonValue:Comparable value (same currency, within two times the estimate)`;
  }
}

export function dispositionLabel(disposition: string, awardState?: string | null): string {
  // Red-team G077 (CF-046 AC8): an award the firm declined or the buyer withdrew is not shown as an award.
  if (disposition === 'Award' && awardState === 'Declined')
    return $localize`:@@intel.awardDeclinedChip:Award declined`;
  if (disposition === 'Award' && awardState === 'Withdrawn')
    return $localize`:@@intel.awardWithdrawnChip:Award withdrawn`;
  switch (disposition) {
    case 'Award':
      return $localize`:@@intel.dispositionAward:Awarded`;
    case 'Reserve':
      return $localize`:@@intel.dispositionReserve:Kept as reserve`;
    default:
      return $localize`:@@intel.dispositionReject:Not selected`;
  }
}

/** "60.0 %" — or "—" when there is nothing to divide by. */
export function rate(value: string | null | undefined): string {
  return value ? `${value} %` : '—';
}

/** Hours as the most readable unit: under an hour in minutes, under two days in hours, otherwise in days (one decimal). */
export function duration(hours: string | null | undefined): string {
  if (!hours) return '—';
  const value = Number(hours);
  if (!Number.isFinite(value)) return '—';
  if (value < 1)
    return $localize`:@@intel.minutes:${Math.max(0, Math.round(value * 60))}:value: min`;
  if (value < 48) return $localize`:@@intel.hours:${trim(value)}:value: h`;
  return $localize`:@@intel.days:${trim(value / 24)}:value: days`;
}

/** One value of a sample: its median when there are two or more observations, its only value when there is one. */
export function central(summary: SampleSummary | null | undefined): string | null {
  if (!summary || summary.count === 0) return null;
  return summary.count === 1 ? summary.minimum : summary.median;
}

/**
 * CF-125 (ADR-128): the decimals a central value deserves for its sample — one rating is a whole number, a percentage of one observation
 * or a sample of 2–4 has one decimal, and from 5 observations the API's two decimals are kept. Display only: the API is unchanged.
 */
export function samplePrecision(count: number, kind: 'rating' | 'percent'): number {
  if (count >= 5) return 2;
  return count === 1 && kind === 'rating' ? 0 : 1;
}

/** Rounds a decimal string ("6.67", "-0.35") to fewer decimals, half away from zero, exactly (no floating point). */
export function roundDecimal(value: string, decimals: number): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return value;
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length <= decimals)
    return decimals === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction.padEnd(decimals, '0')}`;
  const digits = BigInt(whole + fraction.slice(0, decimals));
  const rounded = Number(fraction[decimals]) >= 5 ? digits + 1n : digits;
  const text = rounded.toString().padStart(decimals + 1, '0');
  const integer = decimals === 0 ? text : text.slice(0, -decimals);
  const result = decimals === 0 ? integer : `${integer}.${text.slice(-decimals)}`;
  return /^0(\.0+)?$/.test(result) ? result : `${sign}${result}`;
}

/** CF-125: the central value of a sample at the precision its size deserves (null without observations). */
export function centralAt(
  summary: SampleSummary | null | undefined,
  kind: 'rating' | 'percent',
): string | null {
  const value = central(summary);
  return value === null || !summary
    ? null
    : roundDecimal(value, samplePrecision(summary.count, kind));
}

/** CF-124 (ADR-128): the share of the bidding window used before the first bid, as a whole percent (null without a submission). */
export function windowShare(summary: SampleSummary | null | undefined): string | null {
  const value = central(summary);
  return value === null ? null : roundDecimal(value, 0);
}

function trim(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}
