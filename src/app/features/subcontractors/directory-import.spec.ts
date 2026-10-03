import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { SubcontractorImportPage } from './subcontractor-import';
import { SubcontractorsList } from './subcontractors-list';
import { IMPORT_MAX_BYTES, ImportPreview } from './subcontractors.api';

const PREVIEW = '/api/v1/subcontractors/import/preview';
const CONFIRM = '/api/v1/subcontractors/import/confirm';

function configure(permissions: readonly string[]) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({ userId: 'u1', tenantId: 't', roles: ['CompanyAdmin'], permissions });
  return TestBed.inject(HttpTestingController);
}

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    sha256: 'a'.repeat(64),
    format: 'Csv',
    counts: { rows: 6, create: 3, unchanged: 1, differs: 1, errors: 1, warnings: 2 },
    capacity: { usage: 10, limit: 50, required: 3, sufficient: true },
    fileIssues: [
      {
        severity: 'Warning',
        code: 'import.column_unknown',
        column: null,
        parameters: { position: '13', column: 'tenant_id' },
      },
    ],
    rows: [
      row(2, 'NEW-1', 'Create'),
      row(3, 'NEW-2', 'Create', [
        {
          severity: 'Warning',
          code: 'import.possible_duplicate',
          column: 'legal_name',
          parameters: { code: 'OLD-9' },
        },
      ]),
      row(4, 'SAME-1', 'Unchanged', [
        {
          severity: 'Warning',
          code: 'import.existing_trade_ignored',
          column: 'trades',
          parameters: { trade: 'OLD', state: 'retired' },
        },
      ]),
      { ...row(5, 'DIFF-1', 'Differs'), differingFields: ['city', 'trades'] },
      row(6, null, 'Error', [
        {
          severity: 'Error',
          code: 'import.trade_unknown',
          column: 'trades',
          parameters: { trade: 'NOPE' },
        },
        { severity: 'Error', code: 'import.future_rule', column: 'notes', parameters: null },
      ]),
      row(7, 'NEW-3', 'Create'),
    ],
    canConfirm: false,
    ...overrides,
  };
}

function row(
  number: number,
  code: string | null,
  outcome: ImportPreview['rows'][number]['outcome'],
  issues: ImportPreview['rows'][number]['issues'] = [],
): ImportPreview['rows'][number] {
  return {
    row: number,
    code,
    legalName: code ? `${code} Firm` : null,
    outcome,
    differingFields: [],
    issues,
  };
}

function choose(element: HTMLElement, file: File) {
  const input = element.querySelector<HTMLInputElement>('#import-file')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
}

const csv = (body = 'code,legal_name\r\nNEW-1,Firm\r\n') =>
  new File([body], 'directory.csv', { type: 'text/csv' });

const button = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    (b.textContent ?? '').includes(label),
  )!;

describe('subcontractor import', () => {
  it('checks the file, shows what each row would do in stable localized words and blocks confirmation on errors', () => {
    const http = configure(['Subcontractors.View', 'Subcontractors.Import']);
    const fixture = TestBed.createComponent(SubcontractorImportPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(
      element.querySelector('a[href="/api/v1/subcontractors/import/template"]'),
    ).not.toBeNull();

    choose(element, csv());
    // CF-056 (ADR-096): valid rows are the default; this file is checked all or nothing.
    fixture.componentInstance.validRows = false;
    fixture.detectChanges();
    button(element, 'Check file').click();
    const request = http.expectOne(PREVIEW);
    const body = request.request.body as FormData;
    expect((body.get('file') as File).name).toBe('directory.csv');
    expect(body.get('sha256')).toBeNull();
    expect(body.get('mode')).toBe('all_or_nothing');
    request.flush(preview());
    fixture.detectChanges();

    const page = text(element);
    expect(page).toContain('Column tenant_id is not recognised and will be ignored.');
    expect(page).toContain('Directory places needed: 3.');
    expect(page).toContain('Places left in your plan: 40.');
    expect(page).toContain('Nothing can be imported while any row has an error.');
    // With errors present the review opens on them.
    expect(page).toContain('Trade NOPE does not exist in this company.');
    // An unknown code never shows server text; it gets a safe localized fallback.
    expect(page).toContain('This value cannot be imported.');
    expect(page).not.toContain('NEW-1 Firm');
    const confirm = button(element, 'Import subcontractors');
    expect(confirm.disabled).toBe(true);
    expect(confirm.getAttribute('aria-describedby')).toBe('import-blocker');

    button(element, 'All (6)').click();
    fixture.detectChanges();
    const chips = [...element.querySelectorAll('.imp-kind')].map((chip) =>
      chip.textContent?.trim(),
    );
    expect(chips).toEqual([
      'Will be added',
      'Possible duplicate',
      'Already in directory',
      'Already in directory, differs',
      'Error',
      'Will be added',
    ]);
    expect(text(element)).toContain('Subcontractor OLD-9 has the same legal name.');
    expect(text(element)).toContain(
      'The directory holds different City and Trades. It will not be changed.',
    );
    expect(button(element, 'All (6)').getAttribute('aria-pressed')).toBe('true');
    // A warning on an existing-code row explains that its trade is ignored, and never blocks.
    expect(text(element)).toContain(
      'Trade OLD is retired. It is ignored: this code is already in your directory, and an import never changes existing subcontractors.',
    );
    const ignored = [...element.querySelectorAll('.imp-issues li')].find((item) =>
      item.textContent?.includes('Trade OLD is retired'),
    )!;
    expect(ignored.classList.contains('imp-bad')).toBe(false);
    button(element, 'Warnings (2)').click();
    fixture.detectChanges();
    expect(
      [...element.querySelectorAll('.imp-table tbody tr:not(.imp-details) td:nth-child(2)')].map(
        (cell) => cell.textContent?.trim(),
      ),
    ).toEqual(['NEW-2', 'SAME-1']);
    button(element, 'Already in directory (2)').click();
    fixture.detectChanges();
    expect(element.querySelectorAll('.imp-table tbody tr:not(.imp-details)').length).toBe(2);
    http.verify();
  });

  it('confirms with the same file and the previewed checksum, then reports what was added', () => {
    const http = configure(['Subcontractors.View', 'Subcontractors.Import']);
    const fixture = TestBed.createComponent(SubcontractorImportPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const file = csv();
    choose(element, file);
    fixture.detectChanges();
    button(element, 'Check file').click();
    http.expectOne(PREVIEW).flush(
      preview({
        counts: { rows: 2, create: 2, unchanged: 0, differs: 0, errors: 0, warnings: 0 },
        rows: [row(2, 'NEW-1', 'Create'), row(3, 'NEW-2', 'Create')],
        fileIssues: [],
        capacity: { usage: 0, limit: 5, required: 2, sufficient: true },
        canConfirm: true,
      }),
    );
    fixture.detectChanges();
    button(element, 'Import subcontractors').click();
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]')!;
    expect(text(dialog as HTMLElement)).toContain('New subcontractors to add: 2.');
    button(element, 'Add subcontractors').click();
    const request = http.expectOne(CONFIRM);
    const body = request.request.body as FormData;
    const sent = body.get('file') as File;
    expect([sent.name, sent.size]).toEqual([file.name, file.size]);
    expect(body.get('sha256')).toBe('a'.repeat(64));
    request.flush({
      batchId: 'b1',
      sha256: 'a'.repeat(64),
      format: 'Csv',
      counts: { rows: 2, create: 2, unchanged: 0, differs: 0, errors: 0, warnings: 0 },
    });
    fixture.detectChanges();
    expect(text(element)).toContain('Import complete');
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      'Existing records were not changed.',
    );
    expect(element.querySelector('a[href="/subcontractors"]')).not.toBeNull();
    http.verify();
  });

  it('explains a refused confirmation and offers to check the file again', () => {
    const http = configure(['Subcontractors.View', 'Subcontractors.Import']);
    const fixture = TestBed.createComponent(SubcontractorImportPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    choose(element, csv());
    fixture.detectChanges();
    button(element, 'Check file').click();
    http.expectOne(PREVIEW).flush(preview({ canConfirm: true, rows: [row(2, 'NEW-1', 'Create')] }));
    fixture.detectChanges();
    button(element, 'Import subcontractors').click();
    fixture.detectChanges();
    button(element, 'Add subcontractors').click();
    http
      .expectOne(CONFIRM)
      .flush(
        { code: 'import.not_valid', detail: 'raw server wording', parameters: { errors: '1' } },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();
    const alert = element.querySelector('[role="alert"]') as HTMLElement;
    expect(text(alert)).toContain('The directory changed after the preview');
    expect(text(alert)).not.toContain('raw server wording');
    button(element, 'Check the file again').click();
    http.expectOne(PREVIEW).flush(preview());
    http.verify();
  });

  it('refuses sizes the server would refuse without uploading, and explains a proxy size refusal', () => {
    const http = configure(['Subcontractors.View', 'Subcontractors.Import']);
    const fixture = TestBed.createComponent(SubcontractorImportPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const large = csv();
    Object.defineProperty(large, 'size', { value: IMPORT_MAX_BYTES + 1 });
    choose(element, large);
    fixture.detectChanges();
    expect(text(element)).toContain('The file is larger than 5 MB.');
    expect(button(element, 'Check file').disabled).toBe(true);
    http.expectNone(PREVIEW);

    choose(element, new File([], 'empty.csv'));
    fixture.detectChanges();
    expect(text(element)).toContain('The file is empty.');

    choose(element, csv());
    fixture.detectChanges();
    button(element, 'Check file').click();
    http
      .expectOne(PREVIEW)
      .flush('<html>413</html>', { status: 413, statusText: 'Request Entity Too Large' });
    fixture.detectChanges();
    expect(text(element.querySelector('[role="alert"]') as HTMLElement)).toContain(
      'The file is larger than 5 MB.',
    );
    http.verify();
  });

  it('offers the import entry point only to people who may import', () => {
    for (const [permissions, shown] of [
      [['Subcontractors.View', 'Subcontractors.Import'], true],
      [['Subcontractors.View'], false],
    ] as const) {
      TestBed.resetTestingModule();
      const http = configure(permissions);
      const fixture = TestBed.createComponent(SubcontractorsList);
      fixture.detectChanges();
      http.expectOne('/api/v1/trades').flush([]);
      http
        .expectOne((r) => r.url === '/api/v1/subcontractors')
        .flush({ items: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 0 });
      fixture.detectChanges();
      const link = (fixture.nativeElement as HTMLElement).querySelector(
        'a[href="/subcontractors/import"]',
      );
      expect(link !== null).toBe(shown);
    }
  });

  it('imports the valid rows by default, completes existing firms on request and offers the rejected rows as a correction sheet (CF-056)', () => {
    const http = configure(['Subcontractors.View', 'Subcontractors.Import']);
    const fixture = TestBed.createComponent(SubcontractorImportPage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    choose(element, csv());
    fixture.componentInstance.updateExisting = true;
    fixture.detectChanges();
    button(element, 'Check file').click();
    const request = http.expectOne(PREVIEW);
    const body = request.request.body as FormData;
    expect(body.get('mode')).toBe('valid_rows');
    expect(body.get('updateExisting')).toBe('true');
    request.flush(
      preview({
        canConfirm: true,
        rows: [
          {
            ...row(2, 'SAME-1', 'Update'),
            addedFields: ['tradingName', 'contacts'],
            differingFields: ['city'],
          },
          row(3, 'NEW-1', 'Create'),
          row(4, 'NEW-1', 'Contact'),
          row(5, null, 'Error', [
            {
              severity: 'Error',
              code: 'import.trade_unknown',
              column: 'trades',
              parameters: { trade: 'NOPE' },
            },
          ]),
        ],
      }),
    );
    // A file with errors opens on the error rows; show all of them.
    fixture.componentInstance.setFilter('all');
    fixture.detectChanges();
    const page = text(element);
    expect(page).toContain('Already in directory, details will be added');
    expect(page).toContain('Will add Trading name and Contacts to the existing record.');
    expect(page).toContain('Adds a contact to the firm above');
    fixture.componentInstance.confirm();
    http.expectOne(CONFIRM).flush({
      batchId: 'b1',
      sha256: 'a'.repeat(64),
      format: 'Csv',
      counts: {
        rows: 4,
        create: 1,
        unchanged: 0,
        differs: 0,
        errors: 1,
        warnings: 0,
        update: 1,
        contact: 1,
      },
      rejected: [
        row(5, null, 'Error', [
          {
            severity: 'Error',
            code: 'import.trade_unknown',
            column: 'trades',
            parameters: { trade: 'NOPE' },
          },
        ]),
      ],
    });
    fixture.detectChanges();
    expect(text(element)).toContain('Existing firms completed');
    expect(text(element)).toContain('Some rows were not imported.');
    globalThis.URL.createObjectURL ??= () => 'blob:x';
    globalThis.URL.revokeObjectURL ??= () => undefined;
    button(element, 'Download correction sheet').click();
    const corrections = http.expectOne('/api/v1/subcontractors/import/corrections');
    expect((corrections.request.body as FormData).get('mode')).toBe('valid_rows');
    corrections.flush(new Blob(['code,issues']));
  });
});
