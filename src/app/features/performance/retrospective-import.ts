import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { knownProductProblem } from '../../core/localization/product-problem';
import { performanceProblemMessage } from './performance.api';
import { missingLabel, retrospectiveBadge } from './performance-labels';
import {
  RetrospectiveApi,
  RetrospectiveImportIssue,
  RetrospectiveImportPreview,
  RetrospectiveImportResult,
} from './retrospective.api';

/**
 * CF-002 (ADR-126): past outcomes imported from a CSV or .xlsx file in two steps (ADR-037): the file is checked row by row and nothing is
 * written; confirming imports exactly the file that was checked (by its hash), all or nothing. A file's rows are created once, however often it
 * is uploaded; imported rows wait for confirmation like any other record.
 */
@Component({
  selector: 'app-retrospective-import',
  imports: [RouterLink],
  template: `
    <section class="prj-page" aria-labelledby="retro-import-title">
      <p>
        <a routerLink="/retrospective-outcomes" i18n="@@retrospective.back">All past outcomes</a>
      </p>
      <h1 id="retro-import-title" i18n="@@retrospective.importTitle">Import past outcomes</h1>
      <p class="prj-chip dc-state dc-state--muted">{{ badge }}</p>
      <p class="prj-hint" i18n="@@retrospective.importIntro">
        One row per past subcontract, using the directory's subcontractor codes and the trade
        catalogue's codes. Dates as 2025-03-31; amounts with a point for decimals. Imported rows are
        confirmed one by one afterwards.
      </p>
      <p>
        <a [href]="templateUrl" download i18n="@@retrospective.template"
          >Download the template (CSV)</a
        >
      </p>
      <div class="prj-field">
        <label for="retro-file" i18n="@@retrospective.file">File (CSV or .xlsx)</label>
        <input id="retro-file" type="file" accept=".csv,.xlsx,text/csv" (change)="choose($event)" />
      </div>
      <button
        class="prj-btn"
        type="button"
        [disabled]="!file() || busy()"
        (click)="check()"
        i18n="@@retrospective.check"
      >
        Check the file
      </button>
      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
      }
      @if (result(); as done) {
        <div class="prj-note" role="status">
          <span i18n="@@retrospective.importDone">{done.created, plural,
            =1 {1 past outcome imported. It waits for confirmation.}
            other {{{ done.created }} past outcomes imported. They wait for confirmation.}
          }</span>
        </div>
      } @else if (preview(); as checked) {
        <p role="status" i18n="@@retrospective.previewCounts">
          Rows: <bdi dir="ltr">{{ checked.rows }}</bdi> · new:
          <bdi dir="ltr">{{ checked.toCreate }}</bdi> · already imported:
          <bdi dir="ltr">{{ checked.duplicates }}</bdi> · refused:
          <bdi dir="ltr">{{ checked.errors }}</bdi>
        </p>
        <table class="prj-table">
          <thead>
            <tr>
              <th scope="col" i18n="@@retrospective.colRow">Row</th>
              <th scope="col" i18n="@@retrospective.colFirm">Subcontractor</th>
              <th scope="col" i18n="@@retrospective.colProject">Project</th>
              <th scope="col" i18n="@@retrospective.colResult">Result</th>
            </tr>
          </thead>
          <tbody>
            @for (row of checked.items; track row.row) {
              <tr>
                <td>
                  <bdi dir="ltr">{{ row.row }}</bdi>
                </td>
                <td>
                  <bdi dir="ltr">{{ row.subcontractorCode ?? '—' }}</bdi>
                </td>
                <td>
                  <bdi>{{ row.projectLabel ?? '—' }}</bdi>
                </td>
                <td>
                  @switch (row.outcome) {
                    @case ('Create') {
                      <span i18n="@@retrospective.rowCreate">New</span>
                    }
                    @case ('Duplicate') {
                      <span i18n="@@retrospective.rowDuplicate"
                        >Already imported from this file</span
                      >
                    }
                    @default {
                      <ul class="prj-error-text">
                        @for (issue of row.issues; track $index) {
                          <li>{{ issueText(issue) }}</li>
                        }
                      </ul>
                    }
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (checked.canConfirm) {
          <button
            class="prj-btn"
            type="button"
            [disabled]="busy()"
            (click)="confirm()"
            i18n="@@retrospective.confirmImport"
          >
            Import the new rows
          </button>
        } @else if (checked.errors > 0) {
          <p class="prj-hint" i18n="@@retrospective.fixRows">
            Correct the refused rows and check the file again.
          </p>
        } @else {
          <p class="prj-hint" i18n="@@retrospective.nothingNew">Nothing in this file is new.</p>
        }
      }
    </section>
  `,
})
export class RetrospectiveImport {
  private readonly api = inject(RetrospectiveApi);
  readonly badge = retrospectiveBadge();
  readonly templateUrl = this.api.templateUrl();
  readonly file = signal<File | null>(null);
  readonly preview = signal<RetrospectiveImportPreview | null>(null);
  readonly result = signal<RetrospectiveImportResult | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);

  choose(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
    this.preview.set(null);
    this.result.set(null);
  }

  check(): void {
    const file = this.file();
    if (!file || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.previewImport(file).subscribe({
      next: (preview) => {
        this.busy.set(false);
        this.preview.set(preview);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(performanceProblemMessage(error));
      },
    });
  }

  confirm(): void {
    const file = this.file();
    const preview = this.preview();
    if (!file || !preview || this.busy()) return;
    this.busy.set(true);
    this.api.confirmImport(file, preview.sha256).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.result.set(result);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(performanceProblemMessage(error));
      },
    });
  }

  /** A row's refusal in words: the field missing or the product problem, with the column it concerns. */
  issueText(issue: RetrospectiveImportIssue): string {
    if (issue.code === 'retrospective.incomplete' && issue.column)
      return missingLabel(issue.column);
    const known = knownProductProblem({
      code: issue.code,
      parameters: issue.parameters ?? undefined,
    });
    const message = known ?? issue.code;
    return issue.column ? `${message} (${issue.column})` : message;
  }
}
