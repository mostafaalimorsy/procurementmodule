import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BusinessNumberPipe } from '../../core/localization/business-format';
import { directoryFieldLabel, formatList } from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { knownProductProblem } from '../../core/localization/product-problem';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import {
  DirectoryApi,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_CSV_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_TEMPLATE_URL,
  ImportIssue,
  ImportPreview,
  ImportResult,
  ImportOptions,
  ImportRow,
  importProblemMessage,
} from './subcontractors.api';

type Step = 'select' | 'checking' | 'preview' | 'confirming' | 'done';
/** How a row is presented. A possible duplicate is a warning worth its own name. */
export type RowKind =
  'create' | 'duplicate' | 'warning' | 'unchanged' | 'differs' | 'error' | 'update' | 'contact';
type RowFilter = 'all' | 'error' | 'warning' | 'create' | 'existing';

const PAGE_SIZE = 50;
/** Refusals of a confirmation that a fresh check of the same file can resolve. */
const RECHECKABLE = new Set([
  'import.not_valid',
  'import.file_changed',
  'import.nothing_to_create',
  'quota.exceeded',
  'concurrency.retry',
]);

/**
 * Bulk creation from a file: select, check, review, confirm. Nothing is stored until the person
 * confirms, and the confirmation sends the same file again so the server can judge it against the
 * directory as it is at that moment. Existing codes are skipped, never updated.
 */
@Component({
  selector: 'app-subcontractor-import',
  imports: [FormsModule, RouterLink, ConfirmDialog, BusinessNumberPipe],
  templateUrl: './subcontractor-import.html',
})
export class SubcontractorImportPage {
  private readonly api = inject(DirectoryApi);
  private readonly locale = inject(LocaleService).locale;

  readonly templateUrl = IMPORT_TEMPLATE_URL;
  readonly maxRows = IMPORT_MAX_ROWS;
  readonly maxMegabytes = IMPORT_MAX_BYTES / 1_048_576;
  readonly maxCsvMegabytes = IMPORT_MAX_CSV_BYTES / 1_048_576;
  readonly confirmHeading = $localize`:@@import.confirmTitle:Add these subcontractors?`;
  readonly confirmLabel = $localize`:@@import.confirmAction:Add subcontractors`;

  readonly step = signal<Step>('select');
  readonly file = signal<File | null>(null);
  readonly preview = signal<ImportPreview | null>(null);
  readonly result = signal<ImportResult | null>(null);
  readonly error = signal('');
  readonly recheck = signal(false);
  readonly confirmOpen = signal(false);
  readonly filter = signal<RowFilter>('all');
  readonly page = signal(1);
  /** CF-056 (ADR-096): import the valid rows (the rest come back as a correction sheet), and optionally add what existing firms lack. */
  validRows = true;
  updateExisting = false;
  readonly downloading = signal(false);
  readonly options = (): ImportOptions => ({
    validRows: this.validRows,
    updateExisting: this.updateExisting,
  });

  readonly filtered = computed(() => {
    const rows = this.preview()?.rows ?? [];
    const filter = this.filter();
    return filter === 'all' ? rows : rows.filter((row) => this.matches(row, filter));
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  readonly visible = computed(() =>
    this.filtered().slice((this.page() - 1) * PAGE_SIZE, this.page() * PAGE_SIZE),
  );
  readonly duplicates = computed(
    () => (this.preview()?.rows ?? []).filter((row) => this.kind(row) === 'duplicate').length,
  );
  readonly remaining = computed(() => {
    const capacity = this.preview()?.capacity;
    return capacity?.limit == null ? null : Math.max(0, capacity.limit - capacity.usage);
  });
  readonly filters = computed(() => {
    const rows = this.preview()?.rows ?? [];
    const count = (filter: RowFilter) =>
      String(
        filter === 'all' ? rows.length : rows.filter((row) => this.matches(row, filter)).length,
      );
    return [
      { value: 'all' as const, label: $localize`:@@import.showAll:All (${count('all')}:count:)` },
      {
        value: 'error' as const,
        label: $localize`:@@import.showErrors:Errors (${count('error')}:count:)`,
      },
      {
        value: 'warning' as const,
        label: $localize`:@@import.showWarnings:Warnings (${count('warning')}:count:)`,
      },
      {
        value: 'create' as const,
        label: $localize`:@@import.showCreate:To be added (${count('create')}:count:)`,
      },
      {
        value: 'existing' as const,
        label: $localize`:@@import.showExisting:Already in directory (${count('existing')}:count:)`,
      },
    ];
  });
  /** Why confirmation is unavailable, in the order a person would fix it. */
  readonly blocker = computed<'errors' | 'capacity' | 'nothing' | null>(() => {
    const preview = this.preview();
    if (!preview || preview.canConfirm) return null;
    if (preview.counts.errors > 0 && !this.validRows) return 'errors';
    if (!preview.capacity.sufficient) return 'capacity';
    return 'nothing';
  });

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.[0] ?? null;
    this.file.set(chosen);
    this.preview.set(null);
    this.result.set(null);
    this.recheck.set(false);
    this.error.set('');
    this.step.set('select');
    // Sizes the server would refuse are explained without uploading anything.
    if (chosen && chosen.size === 0) this.error.set(this.problem('import.file_empty'));
    else if (chosen && chosen.size > IMPORT_MAX_BYTES)
      this.error.set(this.problem('import.file_too_large', { max: String(IMPORT_MAX_BYTES) }));
  }

  get canCheck(): boolean {
    const file = this.file();
    return !!file && file.size > 0 && file.size <= IMPORT_MAX_BYTES && this.step() !== 'checking';
  }

  check(): void {
    const file = this.file();
    if (!file || !this.canCheck) return;
    this.step.set('checking');
    this.error.set('');
    this.recheck.set(false);
    this.api.previewImport(file, this.options()).subscribe({
      next: (preview) => {
        this.preview.set(preview);
        this.filter.set(preview.counts.errors > 0 ? 'error' : 'all');
        this.page.set(1);
        this.step.set('preview');
      },
      error: (error: unknown) => {
        this.preview.set(null);
        this.error.set(importProblemMessage(error));
        this.step.set('select');
      },
    });
  }

  askConfirm(): void {
    if (this.preview()?.canConfirm) this.confirmOpen.set(true);
  }

  confirm(): void {
    const file = this.file();
    const preview = this.preview();
    if (!file || !preview || this.step() === 'confirming') return;
    this.step.set('confirming');
    this.error.set('');
    this.api.confirmImport(file, preview.sha256, this.options()).subscribe({
      next: (result) => {
        this.confirmOpen.set(false);
        this.result.set(result);
        this.step.set('done');
      },
      error: (error: unknown) => {
        this.confirmOpen.set(false);
        this.error.set(importProblemMessage(error));
        const code = error instanceof HttpErrorResponse ? error.error?.code : undefined;
        this.recheck.set(typeof code === 'string' && RECHECKABLE.has(code));
        this.step.set('preview');
      },
    });
  }

  /** Changing an option means the file must be checked again under it. */
  optionsChanged(): void {
    if (this.step() === 'preview') {
      this.preview.set(null);
      this.step.set('select');
    }
  }

  /** CF-056: the rejected rows as a CSV the person corrects and imports again. */
  downloadCorrections(): void {
    const file = this.file();
    if (!file || this.downloading()) return;
    this.downloading.set(true);
    this.api.importCorrections(file, this.options()).subscribe({
      next: (blob) => {
        this.downloading.set(false);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'subcontractor-import-corrections.csv';
        link.click();
        URL.revokeObjectURL(url);
      },
      error: (error: unknown) => {
        this.downloading.set(false);
        this.error.set(importProblemMessage(error));
      },
    });
  }

  startOver(input?: HTMLInputElement): void {
    if (input) input.value = '';
    this.file.set(null);
    this.preview.set(null);
    this.result.set(null);
    this.error.set('');
    this.recheck.set(false);
    this.step.set('select');
  }

  setFilter(filter: RowFilter): void {
    this.filter.set(filter);
    this.page.set(1);
  }

  kind(row: ImportRow): RowKind {
    if (row.outcome === 'Error') return 'error';
    if (row.outcome === 'Update') return 'update';
    if (row.outcome === 'Contact') return 'contact';
    if (row.outcome === 'Unchanged') return 'unchanged';
    if (row.outcome === 'Differs') return 'differs';
    if (row.issues.some((issue) => issue.code === 'import.possible_duplicate')) return 'duplicate';
    return row.issues.some((issue) => issue.severity === 'Warning') ? 'warning' : 'create';
  }

  kindLabel(kind: RowKind): string {
    switch (kind) {
      case 'create':
        return $localize`:@@import.kindCreate:Will be added`;
      case 'duplicate':
        return $localize`:@@import.kindDuplicate:Possible duplicate`;
      case 'warning':
        return $localize`:@@import.kindWarning:Will be added, with a warning`;
      case 'unchanged':
        return $localize`:@@import.kindUnchanged:Already in directory`;
      case 'differs':
        return $localize`:@@import.kindDiffers:Already in directory, differs`;
      case 'error':
        return $localize`:@@import.kindError:Error`;
      case 'update':
        return $localize`:@@import.kindUpdate:Already in directory, details will be added`;
      case 'contact':
        return $localize`:@@import.kindContact:Adds a contact to the firm above`;
    }
  }

  /** A reviewed, localized explanation for every issue; never the server's own text. */
  issueText(issue: ImportIssue): string {
    return (
      knownProductProblem({ code: issue.code, parameters: issue.parameters ?? undefined }) ??
      $localize`:@@import.issueUnknown:This value cannot be imported.`
    );
  }

  /** Field names joined the way the active language lists things (Arabic uses its own comma and و). */
  differing(row: ImportRow): string {
    return formatList(
      row.differingFields.map((field) => directoryFieldLabel(field)),
      this.locale,
    );
  }

  added(row: ImportRow): string {
    return formatList(
      (row.addedFields ?? []).map((field) => directoryFieldLabel(field)),
      this.locale,
    );
  }

  private matches(row: ImportRow, filter: RowFilter): boolean {
    const kind = this.kind(row);
    if (filter === 'error') return kind === 'error';
    // Any row a warning is attached to, including existing-code rows whose trades are ignored.
    if (filter === 'warning')
      return kind !== 'error' && row.issues.some((issue) => issue.severity === 'Warning');
    if (filter === 'create')
      return kind === 'create' || kind === 'duplicate' || kind === 'warning' || kind === 'contact';
    return kind === 'unchanged' || kind === 'differs' || kind === 'update';
  }

  private problem(code: string, parameters?: Record<string, string>): string {
    return knownProductProblem({ code, parameters }) ?? '';
  }
}
