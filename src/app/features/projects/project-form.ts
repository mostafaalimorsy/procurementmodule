import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { problemField, problemFieldErrors } from '../../core/localization/product-problem';
import { SessionService } from '../../core/auth/session.service';
import { tenantRoleLabel } from '../../core/auth/tenant-role-labels';
import { CurrencySelect } from '../../shared/ui/currency-select';
import { CompanyApi, Currency } from '../company/company.api';
import {
  AssignableUser,
  PROJECT_PERMISSIONS,
  ProjectDetail,
  ProjectWrite,
  ProjectsApi,
  projectProblemMessage,
} from './projects.api';
import { ErrorSummary } from '../../shared/ui/error-summary';

/**
 * Create and edit share one form because the fields are identical; only the submit differs.
 *
 * Editing carries the row version it loaded, so a save that would silently overwrite a colleague's
 * change is refused by the server and reported here instead of quietly winning.
 */
@Component({
  selector: 'app-project-form',
  imports: [FormsModule, RouterLink, CurrencySelect, ErrorSummary],
  templateUrl: './project-form.html',
})
export class ProjectForm implements OnInit {
  private readonly api = inject(ProjectsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly company = inject(CompanyApi);
  private readonly session = inject(SessionService);
  /** Re-audit D (ADR-174): choosing a project's manager needs Projects.Create; others see the assignment read only. */
  readonly mayAssignManager = computed(() =>
    this.session.hasPermission(PROJECT_PERMISSIONS.create),
  );
  readonly currencies = signal<readonly Currency[]>([]);
  /** The company default the form started from; null when the company has not chosen one. */
  readonly companyDefault = signal<string | null>(null);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly people = signal<AssignableUser[]>([]);
  readonly roleLabel = tenantRoleLabel;
  readonly existing = signal<ProjectDetail | null>(null);
  /** Red-team B-092-6 (CF-092): the fields the server listed as invalid (request field name → localised message). */
  readonly serverErrors = signal<Readonly<Record<string, string>>>({});
  private readonly summary = viewChild(ErrorSummary);

  code = '';
  name = '';
  description = '';
  clientName = '';
  location = '';
  startDate = '';
  expectedEndDate = '';
  // No currency is assumed: a new project starts from the company default, or the person chooses one.
  currency = '';
  projectManagerAccountId = '';
  procurementOwnerAccountId = '';
  submitted = false;
  /** What makes the shown server refusal stale: any edit (null) or an edit to one named field. */
  private staleOnEdit: { readonly field: string | null } | null = null;

  get isEdit(): boolean {
    return this.existing() !== null;
  }

  get datesOutOfOrder(): boolean {
    return !!this.startDate && !!this.expectedEndDate && this.expectedEndDate < this.startDate;
  }

  get codeInvalid(): boolean {
    const value = this.code.trim();
    return value.length < 2 || value.length > 32 || !/^[A-Za-z0-9\-_/]+$/.test(value);
  }

  get nameInvalid(): boolean {
    const value = this.name.trim();
    return value.length === 0 || value.length > 200;
  }

  get currencyInvalid(): boolean {
    return !/^[A-Z]{3}$/.test(this.currency.trim());
  }

  /** Amounts already recorded in the project's currency fix it (the server refuses a change and says why). */
  get currencyLock(): 'estimates' | 'tenders' | null {
    return this.existing()?.currencyLockReason ?? null;
  }

  chooseCurrency(code: string): void {
    this.currency = code;
    this.clearServerError('currency');
    this.edited();
  }

  /** The server's message for a field it listed, unless the form already shows its own error there. */
  serverError(field: string): string | null {
    return this.serverErrors()[field] ?? null;
  }

  ngOnInit(): void {
    this.api.assignableUsers().subscribe({
      next: (people) => this.people.set(people),
      // A missing directory must not block the form; responsibility is optional.
      error: () => this.people.set([]),
    });
    this.company.currencies().subscribe({
      next: (currencies) => this.currencies.set(currencies),
      error: () => this.currencies.set([]),
    });
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.company.profile().subscribe({
        next: (profile) => {
          this.companyDefault.set(profile.defaultCurrency);
          if (!this.currency && profile.defaultCurrency) this.currency = profile.defaultCurrency;
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
      return;
    }
    this.api.getProject(id).subscribe({
      next: (project) => {
        this.existing.set(project);
        this.code = project.code;
        this.name = project.name;
        this.description = project.description ?? '';
        this.clientName = project.clientName ?? '';
        this.location = project.location ?? '';
        this.startDate = project.startDate ?? '';
        this.expectedEndDate = project.expectedEndDate ?? '';
        this.currency = project.currency ?? '';
        this.projectManagerAccountId = project.projectManagerAccountId ?? '';
        this.procurementOwnerAccountId = project.procurementOwnerAccountId ?? '';
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
    if (this.saving() || this.codeInvalid || this.nameInvalid || this.currencyInvalid) return;
    if (this.datesOutOfOrder) return;
    this.saving.set(true);
    this.error.set('');
    this.serverErrors.set({});
    const body = this.body();
    const current = this.existing();
    const request = current
      ? this.api.updateProject(current.id, {
          ...body,
          actualEndDate: current.actualEndDate,
          version: current.version,
        })
      : this.api.createProject(body);
    request.subscribe({
      next: (project) => this.router.navigate(['/projects', project.id]),
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
    // The schedule's error is reported on the end date; moving the start can resolve it too.
    if (name) this.clearServerError(name === 'startDate' ? 'expectedEndDate' : name);
    const stale = this.staleOnEdit;
    if (!stale) return;
    if (stale.field !== null && (event?.target as HTMLInputElement | null)?.name !== stale.field)
      return;
    this.staleOnEdit = null;
    this.error.set('');
  }

  /**
   * Red-team B-092-6 (CF-092 AC6): a `validation.failed` answer lists every invalid field. Each one in the form is marked
   * `aria-invalid` with its message (and so joins the error summary); a listed field the form has no control for (the actual end date,
   * kept from the record) is named in the page message.
   */
  private showServerErrors(error: unknown): void {
    const errors = problemFieldErrors(error, { code: { max: '32' } });
    this.serverErrors.set(errors);
    const elsewhere = Object.entries(errors)
      .filter(([field]) => !PROJECT_FIELDS.has(field))
      .map(([, message]) => message);
    this.error.set([projectProblemMessage(error), ...elsewhere].join(' '));
    if (Object.keys(errors).length) this.summary()?.refresh();
  }

  private clearServerError(field: string): void {
    if (!(field in this.serverErrors())) return;
    const rest = { ...this.serverErrors() };
    delete rest[field];
    this.serverErrors.set(rest);
  }

  private body(): ProjectWrite {
    return {
      code: this.code.trim(),
      name: this.name.trim(),
      description: blankToNull(this.description),
      clientName: blankToNull(this.clientName),
      location: blankToNull(this.location),
      startDate: blankToNull(this.startDate),
      expectedEndDate: blankToNull(this.expectedEndDate),
      currency: blankToNull(this.currency)?.toUpperCase() ?? null,
      projectManagerAccountId: blankToNull(this.projectManagerAccountId),
      procurementOwnerAccountId: blankToNull(this.procurementOwnerAccountId),
    };
  }
}

/** The request fields this form has a control for, each named by the control's `name`. */
const PROJECT_FIELDS: ReadonlySet<string> = new Set([
  'code',
  'name',
  'description',
  'clientName',
  'location',
  'expectedEndDate',
  'currency',
]);

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
