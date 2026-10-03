/**
 * One presentation model for plan utilization, shared by the Platform Console and the Company Admin
 * plan panel. Thresholds are fixed product rules, not settings: the server still decides every
 * capacity question, and these bands only describe what it reported.
 */
export type UtilizationBand =
  'normal' | 'approaching' | 'atLimit' | 'overLimit' | 'notIncluded' | 'notMeasured';

export interface QuotaReading {
  readonly key: string;
  readonly usage: number;
  readonly limit: number | null;
  readonly measured: boolean;
}

/** Usage at or above this share of the limit, but still below it, is "approaching". */
export const APPROACHING_SHARE = 0.8;
const APPROACHING_PERCENT = APPROACHING_SHARE * 100;

export function utilizationBand(quota: QuotaReading): UtilizationBand {
  if (!quota.measured) return 'notMeasured';
  if (quota.limit === null) return 'notIncluded';
  if (quota.usage > quota.limit) return 'overLimit';
  if (quota.usage === quota.limit) return 'atLimit';
  return quota.usage >= quota.limit * APPROACHING_SHARE ? 'approaching' : 'normal';
}

/**
 * Whole percent of the purchased limit, or null where a percentage would be meaningless. The band
 * decides and the number is kept inside it, so the two never contradict each other: below the limit
 * it rounds down (79.5% is not shown as the 80% that starts "approaching", nor 99.5% as 100%),
 * exactly at the limit it is 100, and over the limit it is always above 100.
 */
export function utilizationPercent(quota: QuotaReading): number | null {
  if (!quota.measured || quota.limit === null || quota.limit <= 0) return null;
  const exact = (quota.usage * 100) / quota.limit;
  switch (utilizationBand(quota)) {
    case 'atLimit':
      return 100;
    case 'overLimit':
      return Math.max(101, Math.ceil(exact));
    case 'approaching':
      return Math.min(99, Math.max(APPROACHING_PERCENT, Math.floor(exact)));
    default:
      return Math.min(APPROACHING_PERCENT - 1, Math.floor(exact));
  }
}

const SEVERITY: Record<UtilizationBand, number> = {
  overLimit: 4,
  atLimit: 3,
  approaching: 2,
  normal: 1,
  notIncluded: 0,
  notMeasured: 0,
};

/** The most pressing measured quota, for a one-line summary; null when nothing is measured. */
export function highestBand(
  quotas: readonly QuotaReading[],
): { readonly band: UtilizationBand; readonly quota: QuotaReading } | null {
  let result: { band: UtilizationBand; quota: QuotaReading } | null = null;
  for (const quota of quotas) {
    const band = utilizationBand(quota);
    if (SEVERITY[band] === 0) continue;
    if (!result || SEVERITY[band] > SEVERITY[result.band]) result = { band, quota };
  }
  return result;
}

/** Bands that warrant commercial follow-up. */
export function needsAttention(band: UtilizationBand | undefined): boolean {
  return band === 'approaching' || band === 'atLimit' || band === 'overLimit';
}
