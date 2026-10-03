import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { sortedCountries } from '../../core/localization/countries';
import { problemField } from '../../core/localization/product-problem';
import {
  ContactWrite,
  DirectoryApi,
  SubcontractorDetail,
  SubcontractorWrite,
  Trade,
  TradeRef,
  directoryProblemMessage,
} from './subcontractors.api';
import { ErrorSummary } from '../../shared/ui/error-summary';

/** A contact row being edited; `id` is kept for existing contacts so their identity survives the edit. */
interface ContactRow {
  id: string | null;
  name: string;
  jobTitle: string;
  email: string;
  phone: string;
}

const MAX_CONTACTS = 20;
const CODE_PATTERN = /^[A-Za-z0-9\-_/]{2,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-subcontractor-form',
  imports: [FormsModule, RouterLink, ErrorSummary],
  templateUrl: './subcontractor-form.html',
})
export class SubcontractorForm implements OnInit {
  private readonly api = inject(DirectoryApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly countries = sortedCountries();
  readonly maxContacts = MAX_CONTACTS;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly existing = signal<SubcontractorDetail | null>(null);
  /** Active trades, plus any retired trade this record already carries (it may keep it). */
  readonly selectableTrades = signal<readonly TradeRef[]>([]);

  code = '';
  legalName = '';
  tradingName = '';
  commercialRegistration = '';
  taxRegistration = '';
  countryCode = '';
  city = '';
  notes = '';
  selectedTrades = new Set<string>();
  contacts: ContactRow[] = [];
  primaryIndex = -1;
  submitted = false;
  private staleOnEdit: { readonly field: string | null } | null = null;
  private allTrades: readonly Trade[] = [];

  get isEdit(): boolean {
    return this.existing() !== null;
  }

  get codeInvalid(): boolean {
    return !this.isEdit && !CODE_PATTERN.test(this.code.trim());
  }

  get legalNameInvalid(): boolean {
    const value = this.legalName.trim();
    return value.length === 0 || value.length > 200;
  }

  contactNameInvalid(row: ContactRow): boolean {
    return row.name.trim().length === 0;
  }

  contactEmailInvalid(row: ContactRow): boolean {
    return row.email.trim().length > 0 && !EMAIL_PATTERN.test(row.email.trim());
  }

  get invalid(): boolean {
    return (
      this.codeInvalid ||
      this.legalNameInvalid ||
      this.contacts.some((row) => this.contactNameInvalid(row) || this.contactEmailInvalid(row))
    );
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.api.trades().subscribe({
      next: (trades) => {
        this.allTrades = trades;
        this.refreshSelectable();
      },
      error: () => (this.allTrades = []),
    });
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.api.get(id).subscribe({
      next: (item) => {
        this.existing.set(item);
        this.code = item.code;
        this.legalName = item.legalName;
        this.tradingName = item.tradingName ?? '';
        this.commercialRegistration = item.commercialRegistrationNumber ?? '';
        this.taxRegistration = item.taxRegistrationNumber ?? '';
        this.countryCode = item.countryCode ?? '';
        this.city = item.city ?? '';
        this.notes = item.notes ?? '';
        this.selectedTrades = new Set(item.trades.map((trade) => trade.id));
        this.contacts = item.contacts.map((contact) => ({
          id: contact.id,
          name: contact.name,
          jobTitle: contact.jobTitle ?? '',
          email: contact.email ?? '',
          phone: contact.phone ?? '',
        }));
        this.primaryIndex = item.contacts.findIndex((contact) => contact.isPrimary);
        this.refreshSelectable();
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(directoryProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  toggleTrade(id: string, checked: boolean): void {
    if (checked) this.selectedTrades.add(id);
    else this.selectedTrades.delete(id);
  }

  addContact(): void {
    if (this.contacts.length >= MAX_CONTACTS) return;
    this.contacts = [...this.contacts, { id: null, name: '', jobTitle: '', email: '', phone: '' }];
    if (this.contacts.length === 1) this.primaryIndex = 0;
  }

  removeContact(index: number): void {
    this.contacts = this.contacts.filter((_, position) => position !== index);
    if (this.primaryIndex === index) this.primaryIndex = -1;
    else if (this.primaryIndex > index) this.primaryIndex--;
  }

  save(): void {
    this.submitted = true;
    if (this.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    const body = this.body();
    const current = this.existing();
    const request = current
      ? this.api.update(current.id, { ...body, version: current.version })
      : this.api.create({ ...body, code: this.code.trim() });
    request.subscribe({
      next: (item) => this.router.navigate(['/subcontractors', item.id]),
      error: (error: unknown) => {
        this.error.set(directoryProblemMessage(error));
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

  /** A refusal about the submitted values is stale once the user edits the relevant field. */
  edited(event?: Event): void {
    const stale = this.staleOnEdit;
    if (!stale) return;
    if (stale.field !== null && (event?.target as HTMLInputElement | null)?.name !== stale.field)
      return;
    this.staleOnEdit = null;
    this.error.set('');
  }

  cancelLink(): unknown[] {
    const current = this.existing();
    return current ? ['/subcontractors', current.id] : ['/subcontractors'];
  }

  private refreshSelectable(): void {
    this.selectableTrades.set(
      this.allTrades.filter((trade) => trade.isActive || this.selectedTrades.has(trade.id)),
    );
  }

  private body(): SubcontractorWrite {
    const contacts: ContactWrite[] = this.contacts.map((row, index) => ({
      id: row.id,
      name: row.name.trim(),
      jobTitle: blankToNull(row.jobTitle),
      email: blankToNull(row.email),
      phone: blankToNull(row.phone),
      isPrimary: index === this.primaryIndex,
    }));
    return {
      legalName: this.legalName.trim(),
      tradingName: blankToNull(this.tradingName),
      commercialRegistrationNumber: blankToNull(this.commercialRegistration),
      taxRegistrationNumber: blankToNull(this.taxRegistration),
      countryCode: blankToNull(this.countryCode),
      city: blankToNull(this.city),
      notes: blankToNull(this.notes),
      tradeIds: [...this.selectedTrades],
      contacts,
    };
  }
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
