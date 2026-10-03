import { Component, computed, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { scheduleFieldLabel, scheduleItemTypeLabel } from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { knownProductProblem } from '../../core/localization/product-problem';
import {
  MAX_SCHEDULE_ITEMS,
  SCHEDULE_ITEM_TYPES,
  ScheduleImport,
  ScheduleImportIssue,
  ScheduleItemInput,
  TenderingApi,
  scheduleInput,
  tenderProblemMessage,
} from './tendering.api';

/**
 * CF-004 (ADR-093): the QS's price schedule — entered row by row or read from an XLSX/CSV file. Reading a file is a dry run: every row is
 * judged and reported, and the items replace the editor's only when the QS applies a file that is valid as a whole. Nothing reaches the
 * tender until the surrounding draft (the tender or an addendum) is saved, where the server judges the schedule again.
 */
@Component({
  selector: 'app-schedule-editor',
  imports: [FormsModule],
  templateUrl: './schedule-editor.html',
  styleUrl: './tendering.scss',
})
export class ScheduleEditor {
  private readonly api = inject(TenderingApi);
  readonly locale = inject(LocaleService).locale;

  readonly items = model.required<ScheduleItemInput[]>();
  readonly tenderId = input.required<string>();
  readonly editable = input(true);
  /** A prefix keeping the ids unique when two editors share a page. */
  readonly idPrefix = input('schedule');

  readonly types = SCHEDULE_ITEM_TYPES;
  readonly maxItems = MAX_SCHEDULE_ITEMS;
  readonly typeLabel = scheduleItemTypeLabel;
  readonly fieldLabel = scheduleFieldLabel;

  readonly reading = signal(false);
  readonly report = signal<ScheduleImport | null>(null);
  readonly readError = signal('');
  readonly status = signal('');

  readonly count = computed(() => this.items().length);
  readonly rowIssues = computed(() =>
    (this.report()?.issues ?? []).filter((issue) => issue.row !== null),
  );
  readonly fileIssues = computed(() =>
    (this.report()?.issues ?? []).filter((issue) => issue.row === null),
  );

  templateUrl(): string {
    return this.api.scheduleTemplateUrl(this.tenderId());
  }

  add(): void {
    if (!this.editable() || this.count() >= MAX_SCHEDULE_ITEMS) return;
    this.items.set([
      ...this.items(),
      {
        key: '',
        section: '',
        description: '',
        unit: '',
        quantity: '',
        type: 'Measured',
        provisionalAmount: '',
      },
    ]);
  }

  remove(index: number): void {
    if (!this.editable()) return;
    this.items.set(this.items().filter((_, position) => position !== index));
  }

  move(index: number, offset: -1 | 1): void {
    const target = index + offset;
    const items = [...this.items()];
    if (!this.editable() || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    this.items.set(items);
  }

  /** Any edit of a cell: a new array, so the surrounding draft sees the change. */
  touched(): void {
    this.items.set([...this.items()]);
  }

  hasQuantity(item: ScheduleItemInput): boolean {
    return item.type === 'Measured' || item.type === 'Optional';
  }

  read(event: Event): void {
    const element = event.target as HTMLInputElement;
    const file = element.files?.[0];
    element.value = '';
    if (!file || this.reading()) return;
    this.reading.set(true);
    this.readError.set('');
    this.status.set('');
    this.report.set(null);
    this.api.importSchedule(this.tenderId(), file).subscribe({
      next: (report) => {
        this.reading.set(false);
        this.report.set(report);
      },
      error: (error: unknown) => {
        this.reading.set(false);
        this.readError.set(tenderProblemMessage(error));
      },
    });
  }

  apply(): void {
    const report = this.report();
    if (!report?.canApply || !this.editable()) return;
    this.items.set(report.items.map(scheduleInput));
    this.report.set(null);
    this.status.set(
      $localize`:@@schedule.applied:${report.items.length}:count: items placed in the schedule. Save the draft to keep them.`,
    );
  }

  discard(): void {
    this.report.set(null);
  }

  issueText(issue: ScheduleImportIssue): string {
    const message =
      knownProductProblem({ code: issue.code, parameters: issue.parameters ?? undefined }) ??
      $localize`:@@schedule.issueOther:This row cannot be read.`;
    if (issue.row === null) return message;
    if (issue.parameters?.['reason'] === 'duplicate' && issue.parameters['firstRow'])
      return $localize`:@@schedule.issueDuplicateRow:Row ${issue.row}:row:: the item code repeats row ${issue.parameters['firstRow']}:first: (codes are unique, ignoring case).`;
    return $localize`:@@schedule.issueRow:Row ${issue.row}:row:: ${message}:message:`;
  }
}
