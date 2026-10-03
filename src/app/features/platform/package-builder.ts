import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { featureLabel, formatList, quotaLabel } from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { PackageTerms } from './package-terms';
import {
  EntitlementCatalogue,
  LimitCatalogueEntry,
  PackageRevision,
  PackageTerms as Terms,
} from './platform-api.service';

export interface BuilderSubmission extends Terms {
  readonly code: string;
}

/** Exact contractual quantities get quick picks, never a slider: 25 seats means 25. */
const QUICK_PICKS: Readonly<Record<string, readonly number[]>> = {
  max_users: [5, 10, 25, 50, 100],
  max_active_projects: [1, 3, 5, 10],
  max_subcontractors: [50, 100, 250, 500],
};

/**
 * Structured commercial package terms. Controls come from the server's entitlement catalogue, so the
 * operator never types a key, and the browser holds no commercial rule of its own: availability,
 * minimums and feature/limit dependencies are what the server published. The server re-validates.
 */
@Component({
  selector: 'app-package-builder',
  imports: [FormsModule, PackageTerms],
  styleUrl: './platform.scss',
  templateUrl: './package-builder.html',
})
export class PackageBuilder {
  readonly catalogue = input.required<EntitlementCatalogue>();
  /** The revision being edited. Null creates a new package. */
  readonly base = input<PackageRevision | null>(null);
  readonly packageCode = input('');
  readonly busy = input(false);
  readonly submitted = output<BuilderSubmission>();
  readonly cancelled = output<void>();

  code = '';
  displayName = '';
  description = '';
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly values = signal<Readonly<Record<string, number | null>>>({});
  /** Carried-over terms the operator chose to drop; nothing is removed silently. */
  protected readonly dropped = signal<ReadonlySet<string>>(new Set());
  protected attempted = false;
  protected readonly quickPicks = QUICK_PICKS;
  /** Joins feature names the way the active language lists things ("A and B", "أ و ب"). */
  private readonly locale = inject(LocaleService).locale;
  protected readonly featureName = featureLabel;
  protected readonly quotaName = quotaLabel;

  protected readonly availableFeatures = computed(() =>
    this.catalogue().features.filter((feature) => feature.available),
  );
  /**
   * Capabilities an existing revision holds that are reserved and cannot be sold (ADR-163): the server refuses any new revision that
   * grants one, so they are shown as not carried into it rather than offered as a choice.
   */
  protected readonly carriedFeatures = computed(() => {
    const available = new Set(this.availableFeatures().map((feature) => feature.key));
    return (this.base()?.features ?? []).filter((key) => !available.has(key));
  });
  protected readonly reservedList = computed(() =>
    formatList(
      this.carriedFeatures().map((key) => featureLabel(key)),
      this.locale,
    ),
  );
  protected readonly carriedLimits = computed(() => {
    const measured = new Set(this.measuredLimits().map((limit) => limit.key));
    return Object.entries(this.base()?.limits ?? {})
      .filter(([key]) => !measured.has(key))
      .map(([key, value]) => ({ key, value }));
  });
  protected readonly measuredLimits = computed(() =>
    this.catalogue().limits.filter((limit) => limit.measured),
  );
  /** Only capacity whose capability is being sold is shown; the rest would be meaningless. */
  protected readonly visibleLimits = computed(() =>
    this.measuredLimits().filter(
      (limit) => !limit.requiredWithFeature || this.selected().has(limit.requiredWithFeature),
    ),
  );

  /**
   * Capacity an existing revision holds while the capability it depends on is not selected — an older
   * revision that never had it, or one the operator just unchecked. It is an existing commercial term,
   * so it is kept and shown as carried over until the operator explicitly clears it.
   */
  protected readonly detachedLimits = computed(() => {
    const existing = this.base()?.limits ?? {};
    return this.measuredLimits()
      .filter(
        (limit) =>
          limit.requiredWithFeature !== null &&
          !this.selected().has(limit.requiredWithFeature) &&
          existing[limit.key] !== undefined,
      )
      .map((limit) => ({
        key: limit.key,
        value: existing[limit.key],
        feature: limit.requiredWithFeature as string,
      }));
  });

  protected readonly preview = computed(() => this.terms());

  /** CF-060 (ADR-137): the stage the selected workflow ends at, as the server's catalogue orders the stages (null: the full loop). */
  protected readonly workflowEnd = computed(() => {
    const stages = this.catalogue().workflowStages ?? [];
    const features = new Set(this.terms().features);
    for (let stage = 0; stage < stages.length - 1; stage++)
      if (features.has(stages[stage]) && !features.has(stages[stage + 1])) return stages[stage];
    return null;
  });
  protected readonly workflowRefused = computed(() => {
    const end = this.workflowEnd();
    return !!end && (this.catalogue().refusedWorkflowEnds ?? []).includes(end);
  });
  /** The operator's acknowledgement of where the workflow ends, cleared whenever that end changes. */
  protected readonly acknowledgedEnd = signal<string | null>(null);

  protected acknowledge(checked: boolean): void {
    this.acknowledgedEnd.set(checked ? this.workflowEnd() : null);
  }

  protected workflowUnacknowledged(): boolean {
    const end = this.workflowEnd();
    return !!end && !this.workflowRefused() && this.acknowledgedEnd() !== end;
  }

  constructor() {
    effect(() => {
      const base = this.base();
      this.code = base ? this.packageCode() : '';
      this.displayName = base?.displayName ?? '';
      this.description = base?.description ?? '';
      this.selected.set(new Set(base?.features ?? []));
      this.values.set({ ...(base?.limits ?? {}) });
      this.dropped.set(new Set());
      this.acknowledgedEnd.set(null);
      this.attempted = false;
    });
  }

  protected toggleFeature(key: string, checked: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  protected toggleCarried(key: string, keep: boolean): void {
    this.dropped.update((current) => {
      const next = new Set(current);
      if (keep) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected setValue(key: string, value: number | string | null): void {
    const parsed = value === null || value === '' ? null : Number(value);
    this.values.update((current) => ({ ...current, [key]: parsed }));
  }

  protected required(limit: LimitCatalogueEntry): boolean {
    return limit.requiredForAssignment || limit.requiredWithFeature !== null;
  }

  protected limitError(limit: LimitCatalogueEntry): 'required' | 'minimum' | 'whole' | null {
    const value = this.values()[limit.key];
    if (value === null || value === undefined) return this.required(limit) ? 'required' : null;
    if (!Number.isSafeInteger(value)) return 'whole';
    if (value < limit.minimum) return 'minimum';
    return null;
  }

  /**
   * Prerequisites a selected capability still lacks, as the server's catalogue states them. The
   * builder never unticks anything on the operator's behalf; it explains and refuses to save.
   */
  protected missingPrerequisites(key: string): readonly string[] {
    if (!this.selected().has(key)) return [];
    const entry = this.catalogue().features.find((feature) => feature.key === key);
    return (entry?.requiresFeatures ?? []).filter((required) => !this.selected().has(required));
  }

  protected prerequisites(key: string): readonly string[] {
    return this.catalogue().features.find((feature) => feature.key === key)?.requiresFeatures ?? [];
  }

  protected prerequisiteNames(keys: readonly string[]): string {
    return formatList(
      keys.map((key) => this.featureName(key)),
      this.locale,
    );
  }

  protected invalid(): boolean {
    return (
      !this.displayName.trim() ||
      this.availableFeatures().some(
        (feature) => this.missingPrerequisites(feature.key).length > 0,
      ) ||
      (!this.base() && !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(this.code.trim())) ||
      this.workflowRefused() ||
      this.workflowUnacknowledged() ||
      this.visibleLimits().some((limit) => this.limitError(limit) !== null)
    );
  }

  protected submit(): void {
    this.attempted = true;
    if (this.invalid() || this.busy()) return;
    this.submitted.emit({
      code: this.code.trim(),
      displayName: this.displayName.trim(),
      description: this.description.trim(),
      ...this.terms(),
      ...(this.workflowEnd() ? { acknowledgedWorkflowEnd: this.workflowEnd() } : {}),
    });
  }

  private terms(): Pick<Terms, 'features' | 'limits'> {
    const available = new Set(this.availableFeatures().map((feature) => feature.key));
    const dropped = this.dropped();
    const features = [...this.selected()].filter((key) => available.has(key));
    const limits: Record<string, number> = {};
    for (const limit of this.visibleLimits()) {
      const value = this.values()[limit.key];
      if (typeof value === 'number' && Number.isSafeInteger(value)) limits[limit.key] = value;
    }
    for (const carried of [...this.carriedLimits(), ...this.detachedLimits()])
      if (!dropped.has(carried.key)) limits[carried.key] = carried.value;
    return { features: features.sort(), limits };
  }
}
