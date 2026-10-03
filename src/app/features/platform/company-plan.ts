import { Component, computed, inject, signal } from '@angular/core';
import { utilizationBand } from '../../core/entitlements/utilization';
import { featureLabel, quotaLabel } from '../../core/localization/labels';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { BandLabel, QuotaUsage } from '../../shared/ui/quota-usage';
import { CompanyStore } from './company-store';
import { PackageTerms } from './package-terms';
import { LimitDiff, planDiff } from './plan-diff';
import { InFlightCounts } from './in-flight-counts';
import { PlatformApi, QuotaStateView, currentRevision, frozenBy } from './platform-api.service';
import { RevisionPicker } from './revision-picker';

/**
 * The company's commercial terms, what it uses of them, and the explicit "Change plan" decision.
 * Old and new terms are shown side by side, with the usage each new limit would face, before
 * anything changes. Nothing is ever deleted or suspended to fit a plan.
 */
@Component({
  selector: 'app-platform-company-plan',
  imports: [PackageTerms, RevisionPicker, ConfirmDialog, QuotaUsage, BandLabel, InFlightCounts],
  styleUrl: './platform.scss',
  templateUrl: './company-plan.html',
})
export class CompanyPlanPage {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PlatformApi);
  protected readonly quotaName = quotaLabel;
  protected readonly featureName = featureLabel;
  protected readonly selectedId = signal('');
  protected readonly confirming = signal(false);
  protected readonly confirmTitle = $localize`:@@plan.confirmTitle:Change this company’s plan?`;
  protected readonly confirmLabel = $localize`:@@plan.change:Change plan`;
  protected readonly newRevisionLabel = $localize`:@@company.newRevision:New package revision`;

  private readonly revisions = computed(() =>
    this.store.packages().flatMap((pack) =>
      pack.revisions.map((revision) => ({
        pack,
        revision,
        isCurrent: currentRevision(pack).id === revision.id,
      })),
    ),
  );

  protected readonly assigned = computed(
    () =>
      this.revisions().find(
        (entry) => entry.revision.id === this.store.company()?.packageRevisionId,
      ) ?? null,
  );
  protected readonly newer = computed(() => {
    const assigned = this.assigned();
    return assigned && !assigned.isCurrent ? currentRevision(assigned.pack) : null;
  });
  protected readonly selected = computed(
    () => this.revisions().find((entry) => entry.revision.id === this.selectedId()) ?? null,
  );
  protected readonly diff = computed(() => {
    const assigned = this.assigned();
    const selected = this.selected();
    return assigned && selected ? planDiff(assigned.revision, selected.revision) : null;
  });
  /** Measured quotas only: capacity nobody counts is not presented as usage. */
  protected readonly quotas = computed(() =>
    (this.store.usage()?.quotas ?? []).filter((quota) => quota.measured),
  );
  /** Limits the new terms would put below today's usage. */
  protected readonly overAfterChange = computed(() =>
    (this.diff()?.limits ?? []).filter((limit) => this.resultBand(limit) === 'overLimit'),
  );

  /** CF-061 (ADR-133): the in-flight counts the removed features would freeze, and the second confirmation over them. */
  protected readonly frozenKeys = computed(() => [
    ...new Set((this.diff()?.removedFeatures ?? []).flatMap((feature) => frozenBy(feature))),
  ]);
  protected readonly frozenCount = computed(() => {
    const counts = this.store.inFlight()?.counts ?? {};
    return this.frozenKeys().reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  });
  protected readonly acknowledged = signal(false);

  protected openConfirm(): void {
    const company = this.store.company();
    this.acknowledged.set(false);
    if (company && this.frozenKeys().length) this.store.loadInFlight(company.id);
    this.confirming.set(true);
  }

  protected windDown(): void {
    const company = this.store.company();
    const target = this.selected();
    if (!company || !target) return;
    this.store.apply(
      this.api.startGrace(company.id, 30, target.revision.id, company.version),
      $localize`:@@plan.windDownStarted:The company is read-only for 30 days; the new plan applies when the grace ends.`,
      () => this.selectedId.set(''),
    );
  }

  protected usageFor(key: string): QuotaStateView | null {
    return this.quotas().find((quota) => quota.key === key) ?? null;
  }

  /** How today's usage would sit against the new limit. */
  protected resultBand(limit: LimitDiff) {
    const usage = this.usageFor(limit.key);
    return usage ? utilizationBand({ ...usage, limit: limit.next }) : null;
  }

  protected change(): void {
    const company = this.store.company();
    const target = this.selected();
    if (!company || !target) return;
    if (this.frozenCount() > 0 && !this.acknowledged()) {
      this.store.error.set(
        $localize`:@@plan.confirmInFlightRequired:Confirm that this freezes the work in progress, or wind down first.`,
      );
      return;
    }
    this.store.apply(
      this.api.assignPackage(
        company.id,
        target.revision.id,
        company.version,
        this.frozenCount() > 0,
      ),
      $localize`:@@company.packageAssigned:Package revision explicitly assigned. Existing records remain intact.`,
      () => this.selectedId.set(''),
      () => this.confirming.set(false),
    );
  }
}
