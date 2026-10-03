import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { problemField, problemFieldErrors } from '../../core/localization/product-problem';
import { parseMoney } from '../../core/localization/money';
import { CompanyApi, Currency } from '../company/company.api';
import { DirectoryApi, TradeRef } from '../subcontractors/subcontractors.api';
import {
  ESTIMATE_ENTRY_PERMISSION,
  ESTIMATE_REASON_MAX,
  ESTIMATE_REASON_MIN,
  ProjectsApi,
  WorkPackageDetail,
  WorkPackageWrite,
  projectProblemMessage,
} from './projects.api';
import { ErrorSummary } from '../../shared/ui/error-summary';

/** Create and edit one procurement scope. Shares the project's currency rather than setting its own. */
@Component({
  selector: 'app-work-package-form',
  imports: [FormsModule, RouterLink, ErrorSummary],
  templateUrl: './work-package-form.html',
})
export class WorkPackageForm implements OnInit {
  private readonly api = inject(ProjectsApi);
  private readonly company = inject(CompanyApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly directory = inject(DirectoryApi);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly existing = signal<WorkPackageDetail | null>(null);
  /** Red-team B-092-6 (CF-092): the fields the server listed as invalid (request field name → localised message). */
  readonly serverErrors = signal<Readonly<Record<string, string>>>({});
  private readonly summary = viewChild(ErrorSummary);
  readonly projectLabel = signal('');
  readonly currency = signal('');
  readonly currencies = signal<readonly Currency[]>([]);
  /** CF-027 (ADR-089): the company's trade catalogue; a category is one of them (null until loaded, [] when unavailable). */
  readonly trades = signal<readonly TradeRef[] | null>(null);

  code = '';
  title = '';
  description = '';
  category = '';
  /** The chosen trade id; LEGACY keeps a legacy package's free text unchanged; '' is no category. */
  tradeChoice = '';
  readonly legacyChoice = LEGACY;
  scopeSummary = '';
  /** What the user typed; sent as an exact decimal string (CF-110), never as a number. */
  estimatedValue = '';
  /** CF-037: why the estimate changes after a tender of the package was published. */
  estimateReason = '';
  readonly reasonMax = ESTIMATE_REASON_MAX;
  readonly reasonMin = ESTIMATE_REASON_MIN;
  plannedStartDate = '';
  plannedEndDate = '';
  submitted = false;
  /** What makes the shown server refusal stale: any edit (null) or an edit to one named field. */
  private staleOnEdit: { readonly field: string | null } | null = null;
  private projectId = '';

  get isEdit(): boolean {
    return this.existing() !== null;
  }

  get codeInvalid(): boolean {
    const value = this.code.trim();
    return value.length < 2 || value.length > 32 || !/^[A-Za-z0-9\-_/]+$/.test(value);
  }

  get titleInvalid(): boolean {
    const value = this.title.trim();
    return value.length === 0 || value.length > 200;
  }

  /** The currency's decimal places; three (the storage limit) until the currency and the catalogue are known. */
  get valueDecimals(): number {
    return this.currencies().find((item) => item.code === this.currency())?.minorUnits ?? 3;
  }

  /**
   * CF-037 (ADR-087): only commercial roles enter the estimate — the server says so for an existing package; for a new one the
   * session's estimate right decides (a Technical Evaluator never). Anyone else never sees the field and sends no estimate.
   */
  get estimateEditable(): boolean {
    const current = this.existing();
    if (current) return current.estimateEditable;
    const identity = this.session.identity();
    return (
      this.session.hasPermission(ESTIMATE_ENTRY_PERMISSION) &&
      !(identity?.roles ?? []).includes('TechnicalEvaluator')
    );
  }

  /** Changing an estimate after a tender of the package was published needs a reason. */
  get estimateReasonNeeded(): boolean {
    const current = this.existing();
    if (!current?.estimateReasonRequired || !this.estimateEditable) return false;
    const typed = parseMoney(this.estimatedValue, this.valueDecimals, true);
    return typed.problem === null && typed.value !== current.estimatedValue;
  }

  get reasonInvalid(): boolean {
    return this.estimateReasonNeeded && this.estimateReason.trim().length < ESTIMATE_REASON_MIN;
  }

  get valueInvalid(): boolean {
    return parseMoney(this.estimatedValue, this.valueDecimals, true).problem !== null;
  }

  get datesOutOfOrder(): boolean {
    return (
      !!this.plannedStartDate &&
      !!this.plannedEndDate &&
      this.plannedEndDate < this.plannedStartDate
    );
  }

  /** Active trades, plus the one already linked even if it was retired since. */
  get tradeOptions(): readonly TradeRef[] {
    const linked = this.existing()?.tradeId;
    return (this.trades() ?? []).filter((trade) => trade.isActive || trade.id === linked);
  }

  /** A package categorized before ADR-089: free text and no trade. */
  get legacyCategory(): string | null {
    const current = this.existing();
    return current && !current.tradeId && current.category ? current.category : null;
  }

  ngOnInit(): void {
    this.directory.trades().subscribe({
      next: (trades) => this.trades.set(trades),
      error: () => this.trades.set([]),
    });
    this.company.currencies().subscribe({
      next: (currencies) => this.currencies.set(currencies),
      error: () => this.currencies.set([]),
    });
    const packageId = this.route.snapshot.paramMap.get('packageId');
    if (packageId) {
      this.api.getWorkPackage(packageId).subscribe({
        next: (item) => {
          this.existing.set(item);
          this.projectId = item.projectId;
          this.projectLabel.set(`${item.projectCode} · ${item.projectName}`);
          this.currency.set(item.currency ?? '');
          this.code = item.code;
          this.title = item.title;
          this.description = item.description ?? '';
          this.category = item.category ?? '';
          this.tradeChoice = item.tradeId ?? (item.category ? LEGACY : '');
          this.scopeSummary = item.scopeSummary ?? '';
          this.estimatedValue = item.estimatedValue ?? '';
          this.plannedStartDate = item.plannedStartDate ?? '';
          this.plannedEndDate = item.plannedEndDate ?? '';
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(projectProblemMessage(error, 'workPackage'));
          this.loading.set(false);
        },
      });
      return;
    }
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.getProject(this.projectId).subscribe({
      next: (project) => {
        this.projectLabel.set(`${project.code} · ${project.name}`);
        this.currency.set(project.currency ?? '');
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(projectProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  save(): void {
    this.submitted = true;
    if (this.saving() || this.codeInvalid || this.titleInvalid || this.valueInvalid) return;
    if (this.reasonInvalid) return;
    if (this.datesOutOfOrder) return;
    this.saving.set(true);
    this.error.set('');
    this.serverErrors.set({});
    const body = this.body();
    const current = this.existing();
    const request = current
      ? this.api.updateWorkPackage(current.id, { ...body, version: current.version })
      : this.api.createWorkPackage(this.projectId, body);
    request.subscribe({
      next: (item) => this.router.navigate(['/work-packages', item.id]),
      error: (error: unknown) => {
        this.showServerErrors(error);
        const field = problemField(error);
        this.staleOnEdit =
          error instanceof HttpErrorResponse && error.status === 400
            ? { field: null }
            : field
              ? { field }
              : null;
        this.saving.set(false);
      },
    });
  }

  /**
   * A server validation message describes the values that were submitted. Once the user changes a
   * field it is stale, so it is cleared rather than left contradicting the corrected form (E2E-010).
   * A refusal about one field's value, such as a code already in use, is cleared when that field
   * changes. Other conflict and permission messages stay, because editing a field does not resolve
   * them.
   */
  edited(event?: Event): void {
    const name = (event?.target as HTMLInputElement | null)?.name;
    if (name) this.clearServerError(CONTROL_FIELDS[name] ?? name);
    const stale = this.staleOnEdit;
    if (!stale) return;
    if (stale.field !== null && (event?.target as HTMLInputElement | null)?.name !== stale.field)
      return;
    this.staleOnEdit = null;
    this.error.set('');
  }

  /** The server's message for a field it listed (the form's own error for that field, when shown, comes first). */
  serverError(field: string): string | null {
    return this.serverErrors()[field] ?? null;
  }

  /**
   * Red-team B-092-6 (CF-092 AC6): a `validation.failed` answer lists every invalid field. Each one in the form is marked
   * `aria-invalid` with its message (and so joins the error summary); a listed field the form does not show (an estimate the reader may
   * not enter) is named in the page message.
   */
  private showServerErrors(error: unknown): void {
    const errors = problemFieldErrors(error, {
      code: { max: '32' },
      estimatedValue: { decimals: String(this.valueDecimals) },
    });
    this.serverErrors.set(errors);
    const shown = new Set(Object.values(CONTROL_FIELDS));
    if (!this.estimateEditable) shown.delete('estimatedValue');
    const elsewhere = Object.entries(errors)
      .filter(([field]) => !shown.has(field))
      .map(([, message]) => message);
    this.error.set([projectProblemMessage(error, 'workPackage'), ...elsewhere].join(' '));
    if (Object.keys(errors).length) this.summary()?.refresh();
  }

  private clearServerError(field: string): void {
    if (!(field in this.serverErrors())) return;
    const rest = { ...this.serverErrors() };
    delete rest[field];
    this.serverErrors.set(rest);
  }

  cancelLink(): unknown[] {
    const current = this.existing();
    return current ? ['/work-packages', current.id] : ['/projects', this.projectId];
  }

  private body(): WorkPackageWrite {
    return {
      code: this.code.trim(),
      title: this.title.trim(),
      description: blankToNull(this.description),
      // CF-027: a trade id, or a legacy package's own unchanged text; never new free text.
      category: this.tradeChoice === LEGACY ? this.legacyCategory : null,
      tradeId: this.tradeChoice && this.tradeChoice !== LEGACY ? this.tradeChoice : null,
      scopeSummary: blankToNull(this.scopeSummary),
      estimatedValue: this.estimateEditable
        ? parseMoney(this.estimatedValue, this.valueDecimals, true).value
        : null,
      plannedStartDate: blankToNull(this.plannedStartDate),
      plannedEndDate: blankToNull(this.plannedEndDate),
      estimateChangeReason: this.estimateReasonNeeded ? blankToNull(this.estimateReason) : null,
    };
  }
}

const LEGACY = '__legacy__';

/** Each control's `name` → the request field the server names (the schedule's error is reported on the planned end). */
const CONTROL_FIELDS: Readonly<Record<string, string>> = {
  code: 'code',
  title: 'title',
  tradeId: 'category',
  scopeSummary: 'scopeSummary',
  description: 'description',
  estimatedValue: 'estimatedValue',
  plannedStart: 'plannedEndDate',
  plannedEnd: 'plannedEndDate',
};

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
