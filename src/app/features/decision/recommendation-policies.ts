import { SessionService } from '../../core/auth/session.service';
import { DOCUMENT } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { hundredthsText, weightHundredths } from '../evaluation/evaluation.api';
import { isStale } from '../tendering/tendering.api';
import {
  CRITERION_KINDS,
  DecisionApi,
  HistoryRule,
  RECOMMENDATION_POLICY_DESCRIPTION_MAX,
  RECOMMENDATION_POLICY_NAME_MAX,
  RecommendationCriterionInput,
  RecommendationCriterionKind,
  RecommendationPolicy,
  RecommendationPolicySummary,
  RecommendationPolicyVersion,
  decisionProblemMessage,
  parsePassMark,
} from './decision.api';
import { DECISION_PERMISSIONS } from './decision.api';
import { criterionKindLabel, criterionKindRule } from './decision-labels';

interface PolicyForm {
  name: string;
  description: string;
  minimumTechnicalScore: string;
  criteria: RecommendationCriterionInput[];
  historyRule: HistoryRule;
  neutralHistoryScore: string;
}

/**
 * The company's recommendation policies (Part 10): which of the five fixed criteria a recommendation weighs (each at most
 * once), their weights adding up to exactly 100, and an optional technical pass mark. A version used by a recommendation is
 * never changed: saving after use creates the next version, and the history stays readable. Policies become inactive, never
 * deleted. Weights are the company's own choice; the product never suggests them.
 */
@Component({
  selector: 'app-recommendation-policies',
  imports: [FormsModule, BusinessDatePipe],
  templateUrl: './recommendation-policies.html',
  styleUrl: './recommendation-policies.scss',
})
export class RecommendationPolicies implements OnInit {
  private readonly api = inject(DecisionApi);
  private readonly entitlements = inject(EntitlementsService);

  /** CF-128: past performance can be weighed only when the plan includes it. */
  get historyInPlan(): boolean {
    return this.entitlements.has('performance');
  }
  private readonly document = inject(DOCUMENT);
  private readonly session = inject(SessionService);
  /** CF-133 AC5: `?policy={id}&version={n}` opens the exact version a recommendation used. */
  private readonly requested = (() => {
    const params = inject(ActivatedRoute).snapshot?.queryParamMap;
    const version = Number(params?.get('version'));
    const policy = params?.get('policy');
    return policy && Number.isInteger(version) && version > 0 ? { policy, version } : null;
  })();
  /** CF-133: readers see the policies; only a Procurement Manager or Company Admin changes them. */
  readonly canManage = () => this.session.hasPermission(DECISION_PERMISSIONS.managePolicy);

  readonly kinds = CRITERION_KINDS;
  readonly kindLabel = criterionKindLabel;
  readonly kindRule = criterionKindRule;
  readonly nameMax = RECOMMENDATION_POLICY_NAME_MAX;
  readonly descriptionMax = RECOMMENDATION_POLICY_DESCRIPTION_MAX;

  readonly policies = signal<readonly RecommendationPolicySummary[] | null>(null);
  readonly selected = signal<RecommendationPolicy | null>(null);
  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly notice = signal('');
  form: PolicyForm = blank();

  ngOnInit(): void {
    this.load(this.requested?.policy ?? null);
  }

  /** The version a recommendation used, when the page was opened from it and this is that policy. */
  usedVersion(policy: RecommendationPolicy): RecommendationPolicyVersion | null {
    const requested = this.requested;
    if (!requested || requested.policy !== policy.id) return null;
    return policy.versions.find((version) => version.number === requested.version) ?? null;
  }

  load(select: string | null = null): void {
    this.error.set('');
    this.api.policies().subscribe({
      next: (policies) => {
        this.policies.set(policies);
        if (select) this.open(select);
      },
      error: (error: unknown) => this.error.set(decisionProblemMessage(error)),
    });
  }

  open(id: string): void {
    this.api.policy(id).subscribe({
      next: (policy) => {
        this.selected.set(policy);
        this.editing.set(false);
        if (this.usedVersion(policy))
          setTimeout(() => {
            const used = this.document.getElementById('policy-used-version');
            used?.scrollIntoView?.({ block: 'start' });
            used?.focus();
          });
      },
      error: (error: unknown) => this.error.set(decisionProblemMessage(error)),
    });
  }

  startNew(): void {
    this.selected.set(null);
    this.form = blank();
    this.formError.set('');
    this.editing.set(true);
  }

  startEdit(policy: RecommendationPolicy): void {
    this.form = {
      name: policy.name,
      description: policy.description ?? '',
      minimumTechnicalScore: policy.current.minimumTechnicalScore?.toString() ?? '',
      criteria: policy.current.criteria.map((criterion) => ({
        kind: criterion.kind,
        weight: String(criterion.weight),
      })),
      historyRule: policy.current.historyRule ?? 'AllOrNothing',
      neutralHistoryScore: policy.current.neutralHistoryScore?.toString() ?? '',
    };
    this.formError.set('');
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.formError.set('');
  }

  /** A kind another row already uses cannot be chosen again: each criterion is weighed at most once. */
  taken(kind: RecommendationCriterionKind, index: number): boolean {
    return this.form.criteria.some((criterion, at) => at !== index && criterion.kind === kind);
  }

  addCriterion(): void {
    const free = CRITERION_KINDS.find((kind) => !this.form.criteria.some((c) => c.kind === kind));
    if (!free) return;
    this.form.criteria.push({ kind: free, weight: '' });
    this.focus(`rp-kind-${this.form.criteria.length - 1}`);
  }

  removeCriterion(index: number): void {
    this.form.criteria.splice(index, 1);
    const next = Math.min(index, this.form.criteria.length - 1);
    this.focus(next >= 0 ? `rp-kind-${next}` : 'rp-add');
  }

  weighsHistory(): boolean {
    return this.form.criteria.some((criterion) => criterion.kind === 'PastPerformance');
  }

  allUsed(): boolean {
    return this.form.criteria.length >= CRITERION_KINDS.length;
  }

  total(): number | null {
    let sum = 0;
    for (const criterion of this.form.criteria) {
      const value = weightHundredths(criterion.weight);
      if (value === null) return null;
      sum += value;
    }
    return sum;
  }

  totalText(): string {
    const total = this.total();
    return total === null ? '—' : hundredthsText(total);
  }

  save(): void {
    if (this.busy()) return;
    const problem = this.problem();
    if (problem) {
      this.formError.set(problem);
      return;
    }
    this.busy.set(true);
    this.formError.set('');
    const input = {
      ...this.form,
      name: this.form.name.trim(),
      description: this.form.description.trim(),
    };
    const current = this.selected();
    const request = current
      ? this.api.updatePolicy(current.id, input, current.version)
      : this.api.createPolicy(input);
    request.subscribe({
      next: (policy) => {
        this.busy.set(false);
        this.editing.set(false);
        this.selected.set(policy);
        this.notice.set(
          current && policy.currentVersionNumber > current.currentVersionNumber
            ? $localize`:@@rpolicy.versionAdded:Saved as version ${policy.currentVersionNumber}:version:. The earlier version was used by a recommendation and is kept unchanged.`
            : $localize`:@@rpolicy.saved:Recommendation policy saved.`,
        );
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.formError.set(
          isStale(error) && current
            ? $localize`:@@policy.stale:Someone else changed this policy. Reload it and apply your changes again.`
            : decisionProblemMessage(error),
        );
      },
    });
  }

  toggleStatus(policy: RecommendationPolicy): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api
      .setPolicyStatus(
        policy.id,
        policy.status === 'Active' ? 'Inactive' : 'Active',
        policy.version,
      )
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.selected.set(updated);
          this.notice.set(
            updated.status === 'Active'
              ? $localize`:@@rpolicy.activated:Policy activated. It can be chosen when a recommendation is computed.`
              : $localize`:@@rpolicy.deactivated:Policy made inactive. Recommendations already computed with it are kept.`,
          );
          this.load();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(decisionProblemMessage(error));
        },
      });
  }

  private problem(): string {
    if (!this.form.name.trim()) return $localize`:@@policy.nameRequired:Give the policy a name.`;
    if (this.form.criteria.length === 0)
      return $localize`:@@policy.criteriaRequired:Add at least one criterion.`;
    if (this.form.criteria.every((criterion) => criterion.kind === 'PastPerformance'))
      return $localize`:@@rpolicy.currentRequired:Weigh at least one criterion of current evidence (not only past performance).`;
    if (
      this.form.minimumTechnicalScore.trim() &&
      parsePassMark(this.form.minimumTechnicalScore) === null
    )
      return $localize`:@@rpolicy.passMarkInvalid:The technical pass mark is a number from 0 to 100 with at most one decimal, or empty for none.`;
    if (this.total() !== 10000)
      return $localize`:@@policy.weightsTotal:The weights must add up to exactly 100 (now ${this.totalText()}:total:). Each weight has at most two decimals.`;
    if (this.form.criteria.some((criterion) => weightHundredths(criterion.weight) === 0))
      return $localize`:@@rpolicy.weightZero:Each weight must be above 0. Remove a criterion instead of giving it no weight.`;
    if (
      this.form.historyRule === 'Partial' &&
      this.form.neutralHistoryScore.trim() &&
      parsePassMark(this.form.neutralHistoryScore) === null
    )
      return $localize`:@@rpolicy.neutralInvalid:The neutral history value is a number from 0 to 100 with at most one decimal, or empty for 50.`;
    return '';
  }

  private focus(id: string): void {
    setTimeout(() => this.document.getElementById(id)?.focus());
  }
}

function blank(): PolicyForm {
  return {
    name: '',
    description: '',
    minimumTechnicalScore: '',
    criteria: [],
    historyRule: 'AllOrNothing',
    neutralHistoryScore: '',
  };
}
