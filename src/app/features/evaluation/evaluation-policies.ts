import { SessionService } from '../../core/auth/session.service';
import { DOCUMENT } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { isStale } from '../tendering/tendering.api';
import {
  CRITERIA_MAX,
  CRITERION_CATEGORIES,
  CRITERION_NAME_MAX,
  CriterionInput,
  EvaluationApi,
  GUIDANCE_MAX,
  POLICY_DESCRIPTION_MAX,
  POLICY_NAME_MAX,
  POLICY_SCALES,
  Policy,
  PolicySummary,
  PolicyVersion,
  evaluationProblemMessage,
  hundredthsText,
  weightHundredths,
} from './evaluation.api';
import { EVALUATION_PERMISSIONS } from './evaluation.api';
import { criterionCategoryLabel } from './evaluation-labels';

interface PolicyForm {
  name: string;
  description: string;
  scaleMaximum: number;
  blindTechnicalScoring: boolean;
  criteria: CriterionInput[];
  /** Re-audit R-14: the example is saved Inactive — someone activates it once its weights are the company's. */
  initialStatus?: 'Inactive';
}

/**
 * The company's technical scorecard policies (Part 9): named criteria in categories with weights that add up to exactly 100, a
 * common scale, required comments or evidence, and an optional commercial-blind rule. A version used by an evaluation is never
 * changed: saving after use creates the next version, and the history stays readable. Policies are made inactive, never deleted.
 */
@Component({
  selector: 'app-evaluation-policies',
  imports: [FormsModule, BusinessDatePipe],
  templateUrl: './evaluation-policies.html',
  styleUrl: './evaluation-policies.scss',
})
export class EvaluationPolicies implements OnInit {
  private readonly api = inject(EvaluationApi);
  private readonly document = inject(DOCUMENT);
  private readonly session = inject(SessionService);
  /** CF-133 AC5: `?policy={id}&version={n}` opens the exact version an evaluation used. */
  private readonly requested = (() => {
    const params = inject(ActivatedRoute).snapshot?.queryParamMap;
    const version = Number(params?.get('version'));
    const policy = params?.get('policy');
    return policy && Number.isInteger(version) && version > 0 ? { policy, version } : null;
  })();
  /** CF-133: readers see the policies; only a Procurement Manager or Company Admin changes them. */
  readonly canManage = () => this.session.hasPermission(EVALUATION_PERMISSIONS.managePolicy);

  readonly categories = CRITERION_CATEGORIES;
  readonly scales = POLICY_SCALES;
  readonly categoryLabel = criterionCategoryLabel;
  readonly nameMax = POLICY_NAME_MAX;
  readonly descriptionMax = POLICY_DESCRIPTION_MAX;
  readonly criterionNameMax = CRITERION_NAME_MAX;
  readonly guidanceMax = GUIDANCE_MAX;
  readonly criteriaMax = CRITERIA_MAX;

  readonly policies = signal<readonly PolicySummary[] | null>(null);
  readonly selected = signal<Policy | null>(null);
  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly notice = signal('');
  form: PolicyForm = this.blank();

  ngOnInit(): void {
    this.load(this.requested?.policy ?? null);
  }

  /** The version an evaluation used, when the page was opened from it and this is that policy. */
  usedVersion(policy: Policy): PolicyVersion | null {
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
      error: (error: unknown) => this.error.set(evaluationProblemMessage(error)),
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
      error: (error: unknown) => this.error.set(evaluationProblemMessage(error)),
    });
  }

  startNew(): void {
    this.selected.set(null);
    this.form = this.blank();
    this.formError.set('');
    this.editing.set(true);
  }

  /**
   * CF-013 (ADR-165): a labelled example to start from — a technical scorecard most building and fit-out tenders can use as it is or adapt.
   * Nothing is saved until the user saves it.
   */
  startExample(): void {
    this.startNew();
    this.form = {
      name: $localize`:@@policy.exampleName:Example — technical scorecard`,
      description: $localize`:@@policy.exampleDescription:An example to adapt: change the criteria and weights to your company's practice before you rely on it.`,
      scaleMaximum: 10,
      blindTechnicalScoring: true,
      initialStatus: 'Inactive',
      criteria: [
        example(
          $localize`:@@policy.exampleApproach:Technical approach and compliance with the scope`,
          'Technical',
          '30',
        ),
        example($localize`:@@policy.exampleMethod:Method statement`, 'Methodology', '20'),
        example($localize`:@@policy.exampleProgramme:Programme and key dates`, 'Schedule', '20'),
        example($localize`:@@policy.exampleTeam:Team, plant and resources`, 'Resources', '15'),
        example($localize`:@@policy.exampleHse:Health, safety and environment plan`, 'Hse', '15'),
      ],
    };
  }

  startEdit(policy: Policy): void {
    this.form = {
      name: policy.name,
      description: policy.description ?? '',
      scaleMaximum: policy.current.scaleMaximum,
      blindTechnicalScoring: policy.current.blindTechnicalScoring,
      criteria: policy.current.criteria.map((criterion) => ({
        name: criterion.name,
        category: criterion.category,
        weight: String(criterion.weight),
        guidance: criterion.guidance ?? '',
        commentRequired: criterion.commentRequired,
        evidenceRequired: criterion.evidenceRequired,
      })),
    };
    this.formError.set('');
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.formError.set('');
  }

  addCriterion(): void {
    if (this.form.criteria.length >= CRITERIA_MAX) return;
    this.form.criteria.push({
      name: '',
      category: 'Technical',
      weight: '',
      guidance: '',
      commentRequired: false,
      evidenceRequired: false,
    });
  }

  removeCriterion(index: number): void {
    this.form.criteria.splice(index, 1);
    // Focus goes to the criterion now in that place (or the add button), never to a control of a different row by accident.
    const next = Math.min(index, this.form.criteria.length - 1);
    this.focus(next >= 0 ? `criterion-name-${next}` : 'criterion-add');
  }

  move(index: number, by: number): void {
    const target = index + by;
    if (target < 0 || target >= this.form.criteria.length) return;
    const [item] = this.form.criteria.splice(index, 1);
    this.form.criteria.splice(target, 0, item);
    // Focus follows the moved criterion; at the end of the list it stays on the button that still applies.
    const end = by < 0 ? target === 0 : target === this.form.criteria.length - 1;
    this.focus(`criterion-${by < 0 !== end ? 'up' : 'down'}-${target}`);
  }

  private focus(id: string): void {
    setTimeout(() => this.document.getElementById(id)?.focus());
  }

  /** The weights typed so far, added in whole hundredths; null when one of them is not a valid percentage. */
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
    if (!this.form.name.trim()) {
      this.formError.set($localize`:@@policy.nameRequired:Give the policy a name.`);
      return;
    }
    if (this.form.criteria.length === 0) {
      this.formError.set($localize`:@@policy.criteriaRequired:Add at least one criterion.`);
      return;
    }
    if (this.form.criteria.some((criterion) => !criterion.name.trim())) {
      this.formError.set($localize`:@@policy.criterionNameRequired:Name every criterion.`);
      return;
    }
    if (this.total() !== 10000) {
      this.formError.set(
        $localize`:@@policy.weightsTotal:The weights must add up to exactly 100 (now ${this.totalText()}:total:). Each weight has at most two decimals.`,
      );
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
            ? $localize`:@@policy.versionAdded:Saved as version ${policy.currentVersionNumber}:version:. The earlier version was used by an evaluation and is kept unchanged.`
            : policy.status === 'Inactive' && !current
              ? $localize`:@@policy.savedInactive:Saved as inactive. Review the criteria and weights, then activate the policy to use it.`
              : $localize`:@@policy.saved:Policy saved.`,
        );
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error) && current) {
          this.formError.set(
            $localize`:@@policy.stale:Someone else changed this policy. Reload it and apply your changes again.`,
          );
        } else this.formError.set(evaluationProblemMessage(error));
      },
    });
  }

  toggleStatus(policy: Policy): void {
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
              ? $localize`:@@policy.activated:Policy activated. It can be chosen for new evaluations.`
              : $localize`:@@policy.deactivated:Policy made inactive. Evaluations that use it keep it.`,
          );
          this.load();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(evaluationProblemMessage(error));
        },
      });
  }

  private blank(): PolicyForm {
    return {
      name: '',
      description: '',
      scaleMaximum: 10,
      blindTechnicalScoring: false,
      criteria: [],
    };
  }
}

function example(
  name: string,
  category: CriterionInput['category'],
  weight: string,
): CriterionInput {
  return { name, category, weight, guidance: '', commentRequired: false, evidenceRequired: false };
}
