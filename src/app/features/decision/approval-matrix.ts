import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { ltr } from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { parseMoney } from '../../core/localization/money';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { CurrencySelect } from '../../shared/ui/currency-select';
import { CompanyApi, Currency } from '../company/company.api';
import { money } from '../evaluation/evaluation-format';
import { ProjectSummary, ProjectsApi } from '../projects/projects.api';
import { isStale } from '../tendering/tendering.api';
import {
  APPROVAL_CATEGORY_MAX,
  APPROVAL_RULE_NAME_MAX,
  ApprovalMatrix,
  ApprovalRule,
  ApprovalRuleInput,
  DecisionApi,
  decisionProblemMessage,
} from './decision.api';
import { approverRoleLabel } from './decision-labels';

interface RuleForm {
  name: string;
  priority: string;
  active: boolean;
  currency: string;
  minimumValue: string;
  maximumValue: string;
  projectId: string;
  category: string;
  requiredApprovals: number;
  stepRoles: string[];
  allowSelfApproval: boolean;
  weakeningConfirmed: boolean;
  weakeningReason: string;
}

/** Decimals accepted when the currency is not in the catalogue (the server applies the currency's exact minor units). */
const RULE_DECIMALS = 3;

/**
 * The approval matrix (Part 10): which approvals an award decision needs. The first active rule that matches — by priority —
 * decides the route: its number of independent approvals (0 to 3), the role each step needs (or any approver) and whether a
 * submitter may approve their own decision. When no rule matches, one independent approval is required. Values are exact
 * decimal strings: the minimum is inclusive, the maximum exclusive.
 */
@Component({
  selector: 'app-approval-matrix',
  imports: [FormsModule, BusinessDatePipe, ConfirmDialog, CurrencySelect],
  templateUrl: './approval-matrix.html',
  styleUrl: './approval-matrix.scss',
})
export class ApprovalMatrixPage implements OnInit {
  private readonly api = inject(DecisionApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly company = inject(CompanyApi);
  readonly locale = inject(LocaleService).locale;

  readonly roleLabel = approverRoleLabel;
  readonly newHeading = $localize`:@@matrix.newHeading:New approval rule`;
  readonly editHeading = $localize`:@@matrix.editHeading:Edit approval rule`;
  readonly nameMax = APPROVAL_RULE_NAME_MAX;
  readonly categoryMax = APPROVAL_CATEGORY_MAX;

  readonly matrix = signal<ApprovalMatrix | null>(null);
  readonly projects = signal<readonly ProjectSummary[]>([]);
  /** The shared ISO catalogue: its minor units decide how many decimals a rule's values may have. */
  readonly currencies = signal<readonly Currency[]>([]);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly editing = signal<ApprovalRule | 'new' | null>(null);
  readonly formError = signal('');
  form: RuleForm = this.blank();

  readonly rules = computed(() =>
    [...(this.matrix()?.rules ?? [])].sort(
      (a, b) => a.priority - b.priority || a.name.localeCompare(b.name),
    ),
  );
  readonly approvalCounts = computed(() =>
    Array.from({ length: (this.matrix()?.maximumApprovals ?? 3) + 1 }, (_, index) => index),
  );

  ngOnInit(): void {
    this.load();
    this.company.currencies().subscribe({
      next: (currencies) => this.currencies.set(currencies),
      error: () => this.currencies.set([]),
    });
    // The project picker is optional: without access to projects, a rule simply shows its project as not listed.
    this.projectsApi.listProjects({ pageSize: 100 }).subscribe({
      next: (page) => this.projects.set(page.items),
      error: () => this.projects.set([]),
    });
  }

  load(): void {
    this.error.set('');
    this.api.approvalMatrix().subscribe({
      next: (matrix) => this.matrix.set(matrix),
      error: (error: unknown) => this.error.set(decisionProblemMessage(error)),
    });
  }

  projectName(id: string | null): string {
    if (!id) return $localize`:@@matrix.anyProject:Any project`;
    const project = this.projects().find((item) => item.id === id);
    return project
      ? `${project.code} ${project.name}`
      : $localize`:@@matrix.projectUnlisted:A project not listed here`;
  }

  projectListed(id: string): boolean {
    return this.projects().some((project) => project.id === id);
  }

  range(rule: ApprovalRule): string {
    const min = rule.minimumValue ? ltr(money(rule.minimumValue, this.locale)) : null;
    const max = rule.maximumValue ? ltr(money(rule.maximumValue, this.locale)) : null;
    if (min && max)
      return $localize`:@@matrix.rangeBoth:from ${min}:min: (inclusive) up to ${max}:max: (exclusive)`;
    if (min) return $localize`:@@matrix.rangeMin:from ${min}:min: (inclusive)`;
    if (max) return $localize`:@@matrix.rangeMax:below ${max}:max:`;
    return $localize`:@@matrix.rangeAny:any value`;
  }

  startNew(): void {
    this.form = this.blank();
    this.formError.set('');
    this.editing.set('new');
  }

  startEdit(rule: ApprovalRule): void {
    this.form = {
      name: rule.name,
      priority: String(rule.priority),
      active: rule.active,
      currency: rule.currency ?? '',
      minimumValue: rule.minimumValue ?? '',
      maximumValue: rule.maximumValue ?? '',
      projectId: rule.projectId ?? '',
      category: rule.category ?? '',
      requiredApprovals: rule.requiredApprovals,
      stepRoles: rule.stepRoles.map((role) => role ?? ''),
      allowSelfApproval: rule.allowSelfApproval,
      weakeningConfirmed: false,
      weakeningReason: rule.weakeningReason ?? '',
    };
    this.formError.set('');
    this.editing.set(rule);
  }

  /** ADR-084: 0 approvals or self-approval removes the independent check. */
  get weakRoute(): boolean {
    return this.form.requiredApprovals === 0 || this.form.allowSelfApproval;
  }

  setApprovals(count: number): void {
    this.form.requiredApprovals = Number(count);
    this.form.stepRoles = Array.from(
      { length: this.form.requiredApprovals },
      (_, index) => this.form.stepRoles[index] ?? '',
    );
    this.formError.set('');
  }

  close(): void {
    if (this.busy()) return;
    this.editing.set(null);
  }

  save(): void {
    const editing = this.editing();
    if (this.busy() || !editing) return;
    const input = this.input();
    if (typeof input === 'string') {
      this.formError.set(input);
      return;
    }
    this.busy.set(true);
    const request =
      editing === 'new'
        ? this.api.createApprovalRule(input)
        : this.api.updateApprovalRule(editing.id, input, editing.version);
    request.subscribe({
      next: (matrix) => {
        this.busy.set(false);
        this.editing.set(null);
        this.matrix.set(matrix);
        this.notice.set(
          $localize`:@@matrix.saved:Approval rule saved. It applies to decisions submitted from now on.`,
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error)) {
          this.editing.set(null);
          this.load();
          this.notice.set(
            $localize`:@@matrix.stale:Someone else changed this rule. The latest matrix is shown; apply your change again.`,
          );
        } else this.formError.set(decisionProblemMessage(error));
      },
    });
  }

  /** The request, or what is wrong with the form (the server checks every rule again). */
  private input(): ApprovalRuleInput | string {
    const name = this.form.name.trim();
    if (!name) return $localize`:@@matrix.nameRequired:Give the rule a name.`;
    if (!/^\d{1,4}$/.test(this.form.priority.trim()))
      return $localize`:@@matrix.priorityInvalid:The priority is a whole number; the lowest number is checked first.`;
    const currency = this.form.currency.trim().toUpperCase();
    if (currency && !/^[A-Z]{3}$/.test(currency))
      return $localize`:@@matrix.currencyInvalid:Use a three-letter ISO currency code, for example QAR.`;
    const decimals =
      this.currencies().find((item) => item.code === currency)?.minorUnits ?? RULE_DECIMALS;
    const minimum = parseMoney(this.form.minimumValue, decimals, true);
    const maximum = parseMoney(this.form.maximumValue, decimals);
    if (minimum.problem || maximum.problem)
      return $localize`:@@matrix.valueInvalid:Enter values as plain digits, for example 1000000.00 (no currency sign).`;
    if ((minimum.value || maximum.value) && !currency)
      return $localize`:@@matrix.currencyRequired:Choose the currency the value range is in.`;
    const weak = this.form.requiredApprovals === 0 || this.form.allowSelfApproval;
    if (weak && (!this.form.weakeningConfirmed || this.form.weakeningReason.trim().length < 3))
      return $localize`:@@matrix.weakeningRequired:A rule without an independent approval needs your confirmation and the reason your company accepts it.`;
    return {
      weakeningConfirmed: weak && this.form.weakeningConfirmed,
      weakeningReason: weak ? this.form.weakeningReason.trim() : null,
      name,
      priority: Number(this.form.priority.trim()),
      active: this.form.active,
      currency: currency || null,
      minimumValue: plain(minimum.value),
      maximumValue: plain(maximum.value),
      projectId: this.form.projectId || null,
      category: this.form.category.trim() || null,
      requiredApprovals: this.form.requiredApprovals,
      stepRoles: this.form.stepRoles.map((role) => role || null),
      allowSelfApproval: this.form.allowSelfApproval,
    };
  }

  private blank(): RuleForm {
    const next = Math.max(0, ...(this.matrix()?.rules ?? []).map((rule) => rule.priority)) + 10;
    return {
      name: '',
      priority: String(next),
      active: true,
      currency: '',
      minimumValue: '',
      maximumValue: '',
      projectId: '',
      category: '',
      requiredApprovals: 1,
      stepRoles: [''],
      allowSelfApproval: false,
      weakeningConfirmed: false,
      weakeningReason: '',
    };
  }
}

/** The amount as typed, without the zeros parsing padded it with: the server applies the currency's own decimals. */
function plain(value: string | null): string | null {
  return value && value.includes('.') ? value.replace(/\.?0+$/, '') || '0' : value;
}
