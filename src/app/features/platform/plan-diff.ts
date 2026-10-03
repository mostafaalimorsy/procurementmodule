import { PackageTerms } from './platform-api.service';

export type LimitChange = 'increase' | 'decrease' | 'added' | 'removed' | 'unchanged';

export interface LimitDiff {
  readonly key: string;
  readonly current: number | null;
  readonly next: number | null;
  readonly change: LimitChange;
}

export interface PlanDiff {
  readonly limits: readonly LimitDiff[];
  readonly addedFeatures: readonly string[];
  readonly removedFeatures: readonly string[];
  /** Any change that can leave the company with less than it has today. */
  readonly reducesTerms: boolean;
}

const ORDER = ['max_users', 'max_active_projects', 'max_subcontractors'];

/**
 * Old versus new commercial terms, key by key. A missing limit means "not included" — never
 * unlimited — so removing one is a reduction, exactly as the server evaluates it.
 */
export function planDiff(
  current: Pick<PackageTerms, 'features' | 'limits'>,
  next: Pick<PackageTerms, 'features' | 'limits'>,
): PlanDiff {
  const keys = [...new Set([...Object.keys(current.limits), ...Object.keys(next.limits)])].sort(
    (a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b),
  );
  const limits = keys.map((key): LimitDiff => {
    const before = current.limits[key] ?? null;
    const after = next.limits[key] ?? null;
    const change: LimitChange =
      before === null
        ? 'added'
        : after === null
          ? 'removed'
          : after > before
            ? 'increase'
            : after < before
              ? 'decrease'
              : 'unchanged';
    return { key, current: before, next: after, change };
  });
  const addedFeatures = next.features.filter((feature) => !current.features.includes(feature));
  const removedFeatures = current.features.filter((feature) => !next.features.includes(feature));
  return {
    limits,
    addedFeatures,
    removedFeatures,
    reducesTerms:
      removedFeatures.length > 0 ||
      limits.some((limit) => limit.change === 'decrease' || limit.change === 'removed'),
  };
}
