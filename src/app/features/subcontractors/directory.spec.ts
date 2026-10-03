import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { INTELLIGENCE_FEATURES } from '../intelligence/intelligence.api';
import { fullProfile } from '../intelligence/intelligence.fixtures';
import { PERFORMANCE_FEATURES } from '../performance/performance.api';
import { SubcontractorDetailPage } from './subcontractor-detail';
import { SubcontractorForm } from './subcontractor-form';
import { InvalidSubmitFocus } from '../../core/a11y/invalid-submit-focus';
import { SubcontractorsList } from './subcontractors-list';
import { Paged, SubcontractorDetail, SubcontractorSummary, Trade } from './subcontractors.api';
import { TradesAdmin } from './trades-admin';

const ALL = [
  'Subcontractors.View',
  'Subcontractors.Create',
  'Subcontractors.Edit',
  'Subcontractors.ChangeStatus',
  'Subcontractors.Block',
  'Subcontractors.Import',
  'Trades.Manage',
];
const VIEW_ONLY = ['Subcontractors.View'];
const OFFICER = [
  'Subcontractors.View',
  'Subcontractors.Create',
  'Subcontractors.Edit',
  'Subcontractors.ChangeStatus',
  'Subcontractors.Import',
];

const hvac: Trade = {
  id: 't1',
  code: 'HVAC',
  name: 'HVAC',
  isActive: true,
  subcontractorCount: 1,
  updatedAtUtc: '2026-09-01T00:00:00Z',
  version: 'tv1',
};
const legacy: Trade = {
  id: 't2',
  code: 'OLD',
  name: 'Legacy trade',
  isActive: false,
  subcontractorCount: 1,
  updatedAtUtc: '2026-09-01T00:00:00Z',
  version: 'tv2',
};
const unused: Trade = {
  id: 't3',
  code: 'GONE',
  name: 'Unused retired',
  isActive: false,
  subcontractorCount: 0,
  updatedAtUtc: '2026-09-01T00:00:00Z',
  version: 'tv3',
};

const detail: SubcontractorDetail = {
  id: 's1',
  code: 'ACME-01',
  legalName: 'Acme Mechanical LLC',
  tradingName: 'Acme',
  commercialRegistrationNumber: 'CR12345',
  taxRegistrationNumber: null,
  countryCode: 'EG',
  city: 'Cairo',
  status: 'Active',
  statusReason: null,
  notes: 'Reliable.',
  imported: false,
  trades: [
    { id: 't1', code: 'HVAC', name: 'HVAC', isActive: true },
    { id: 't2', code: 'OLD', name: 'Legacy trade', isActive: false },
  ],
  contacts: [
    {
      id: 'c1',
      name: 'Nadia Fouad',
      jobTitle: 'Estimator',
      email: 'nadia@acme.example',
      phone: '+20 100',
      isPrimary: true,
    },
  ],
  allowedNextStatuses: ['Inactive', 'Blocked'],
  createdAtUtc: '2026-09-01T00:00:00Z',
  updatedAtUtc: '2026-09-02T00:00:00Z',
  createdBy: 'u1',
  updatedBy: 'u1',
  version: 'v1',
};

const summary: SubcontractorSummary = {
  id: 's1',
  code: 'ACME-01',
  legalName: 'Acme Mechanical LLC',
  tradingName: 'Acme',
  status: 'Blocked',
  countryCode: 'EG',
  city: 'Cairo',
  trades: [{ id: 't1', code: 'HVAC', name: 'HVAC', isActive: true }],
  primaryContactName: 'Nadia Fouad',
  updatedAtUtc: '2026-09-02T00:00:00Z',
  version: 'v1',
};

function page(items: SubcontractorSummary[]): Paged<SubcontractorSummary> {
  return {
    items,
    page: 1,
    pageSize: 20,
    totalCount: items.length,
    totalPages: items.length ? 1 : 0,
  };
}

function configure(permissions: readonly string[], params: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'subcontractors/:id', children: [] },
        { path: 'subcontractors', children: [] },
      ]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: (key: string) => params[key] ?? null } } },
      },
    ],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({
    userId: 'u1',
    tenantId: 't',
    roles: ['CompanyAdmin'],
    permissions,
  });
  return TestBed.inject(HttpTestingController);
}

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

describe('subcontractor directory list', () => {
  it('sends search, status, trade and sorting to the server and keeps blocked records visible', () => {
    const http = configure(ALL);
    const fixture = TestBed.createComponent(SubcontractorsList);
    fixture.detectChanges();
    http.expectOne('/api/v1/trades').flush([hvac, legacy]);
    http.expectOne((r) => r.url === '/api/v1/subcontractors').flush(page([summary]));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('Blocked');
    expect(text(element)).toContain('Nadia Fouad');
    // The last-updated instant is rendered, not the empty-value dash.
    expect(text(element)).toContain('Sep 2, 2026');
    expect(element.querySelector('a[href="/subcontractors/new"]')).not.toBeNull();
    expect(element.querySelector('a[href="/subcontractors/trades"]')).not.toBeNull();

    const list = fixture.componentInstance;
    list.status = 'Blocked';
    list.tradeId = 't1';
    list.applyFilters();
    const request = http.expectOne((r) => r.url === '/api/v1/subcontractors');
    expect(request.request.params.getAll('status')).toEqual(['Blocked']);
    expect(request.request.params.get('tradeId')).toBe('t1');
    expect(request.request.params.get('sortBy')).toBe('LegalName');
    request.flush(page([summary]));
    list.sortByField('UpdatedAt');
    const sorted = http.expectOne((r) => r.url === '/api/v1/subcontractors');
    expect(sorted.request.params.get('sortBy')).toBe('UpdatedAt');
    expect(sorted.request.params.get('desc')).toBe('true');
    sorted.flush(page([]));
    http.verify();
  });

  it('recovers after a failure instead of leaving the list stuck', () => {
    const http = configure(VIEW_ONLY);
    const fixture = TestBed.createComponent(SubcontractorsList);
    fixture.detectChanges();
    http.expectOne('/api/v1/trades').flush([]);
    http
      .expectOne((r) => r.url === '/api/v1/subcontractors')
      .flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).not.toBe('');
    fixture.componentInstance.reload();
    http.expectOne((r) => r.url === '/api/v1/subcontractors').flush(page([]));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('No subcontractors yet');
    // A reader cannot add, so no add action is offered and the empty state says who can.
    expect(element.querySelector('a[href="/subcontractors/new"]')).toBeNull();
    expect(element.querySelector('a[href="/subcontractors/trades"]')).toBeNull();
    expect(text(element)).toContain('Ask a Procurement Officer');
  });
});

describe('subcontractor detail', () => {
  function render(permissions: readonly string[], item: SubcontractorDetail = detail) {
    const http = configure(permissions, { id: item.id });
    const fixture = TestBed.createComponent(SubcontractorDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/subcontractors/s1').flush(item);
    fixture.detectChanges();
    return { http, fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('shows only real Part 4 information, never empty future sections', () => {
    const { element } = render(VIEW_ONLY);
    const content = text(element);
    for (const expected of [
      'Overview',
      'Trades',
      'Contacts',
      'Notes',
      'CR12345',
      'Legacy trade',
      '(retired)',
      'Primary contact',
    ])
      expect(content).toContain(expected);
    // CF-056: compliance is a real section now; future sections still never appear empty.
    expect(content).toContain('Compliance and approved-vendor status');
    for (const absent of ['Performance', 'Tender', 'Rating']) expect(content).not.toContain(absent);
    // A reader sees no edit or lifecycle actions.
    expect(element.querySelectorAll('.prj-head .prj-actions button').length).toBe(0);
    // Technical identifiers stay left-to-right even in a right-to-left page.
    expect(element.querySelector('bdi[dir="ltr"].ltr-token')?.textContent?.trim()).toBe('CR12345');
  });

  it('offers blocking only with the block permission and requires a reason before sending it', () => {
    const officer = render(OFFICER);
    expect(text(officer.element)).toContain('Deactivate');
    expect(text(officer.element)).not.toContain('Block');
    TestBed.resetTestingModule();

    const { http, fixture, element } = render(ALL);
    const block = [...element.querySelectorAll<HTMLButtonElement>('.prj-head button')].find((b) =>
      b.textContent?.includes('Block'),
    )!;
    block.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
    fixture.componentInstance.confirm();
    fixture.detectChanges();
    expect(fixture.componentInstance.reasonMissing()).toBe(true);
    http.expectNone('/api/v1/subcontractors/s1/status');

    fixture.componentInstance.reason = 'Safety breach on site 4';
    fixture.componentInstance.confirm();
    const request = http.expectOne('/api/v1/subcontractors/s1/status');
    expect(request.request.body).toEqual({
      status: 'Blocked',
      reason: 'Safety breach on site 4',
      version: 'v1',
    });
    request.flush({
      ...detail,
      status: 'Blocked',
      statusReason: 'Safety breach on site 4',
      allowedNextStatuses: ['Inactive'],
      version: 'v2',
    });
    fixture.detectChanges();
    expect(text(element)).toContain('Safety breach on site 4');
    expect(text(element)).toContain('Lift block');
    expect(text(element)).not.toContain('Activate');
  });

  it('lists the live invitations and pending decisions in the block dialog before it is confirmed (red-team G044)', () => {
    const { http, fixture, element } = render(ALL);
    const block = [...element.querySelectorAll<HTMLButtonElement>('.prj-head button')].find((b) =>
      b.textContent?.includes('Block'),
    )!;
    block.click();
    fixture.detectChanges();
    const live = () => element.querySelector('[data-testid="block-live"]') as HTMLElement;
    expect(text(live())).toContain('Live work with this firm');
    expect(text(live())).toContain('Loading…');
    http.expectOne('/api/v1/subcontractors/s1/engagements').flush({
      invitations: [
        {
          tenderId: 't9',
          tenderReference: 'TND-2026-0009',
          tenderTitle: 'HVAC installation',
          decisionState: null,
        },
        {
          tenderId: 't10',
          tenderReference: 'TND-2026-0010',
          tenderTitle: 'Chillers',
          decisionState: null,
        },
      ],
      decisions: [
        {
          tenderId: 't7',
          tenderReference: 'TND-2026-0007',
          tenderTitle: 'Ductwork',
          decisionState: 'PendingApproval',
        },
      ],
    });
    fixture.detectChanges();
    const shown = text(live());
    expect(shown).toContain('2 open invitations');
    expect(shown).toContain('TND-2026-0009');
    expect(shown).toContain('HVAC installation');
    expect(shown).toContain('1 pending decision');
    expect(shown).toContain('TND-2026-0007');
    expect(shown).toContain('Awaiting approval');
    expect(shown).toContain('Blocking does not notify the firm');
    const links = [...live().querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(links).toEqual(['/tenders/t9', '/tenders/t10', '/tenders/t7/decision']);
    // No amount reaches the dialog.
    expect(shown).not.toMatch(/\d{1,3}(,\d{3})+\.\d{2}/);
  });

  it('says when the firm has no live work, and still allows the block when the list cannot be read (red-team G044)', () => {
    const { http, fixture, element } = render(ALL);
    const open = () => {
      [...element.querySelectorAll<HTMLButtonElement>('.prj-head button')]
        .find((b) => b.textContent?.includes('Block'))!
        .click();
      fixture.detectChanges();
    };
    open();
    http
      .expectOne('/api/v1/subcontractors/s1/engagements')
      .flush({ invitations: [], decisions: [] });
    fixture.detectChanges();
    let live = text(element.querySelector('[data-testid="block-live"]') as HTMLElement);
    expect(live).toContain('No open invitations');
    expect(live).toContain('No pending decisions');
    expect(live).not.toContain('Blocking does not notify the firm');
    fixture.componentInstance.dismiss();
    fixture.detectChanges();

    open();
    http
      .expectOne('/api/v1/subcontractors/s1/engagements')
      .flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    live = text(element.querySelector('[data-testid="block-live"]') as HTMLElement);
    expect(live).toContain("The firm's live invitations and decisions could not be loaded");
    const reload = [
      ...element.querySelectorAll<HTMLButtonElement>('[data-testid="block-live"] button'),
    ][0];
    reload.click();
    http
      .expectOne('/api/v1/subcontractors/s1/engagements')
      .flush({ invitations: [], decisions: [] });
    fixture.detectChanges();
    expect(text(element.querySelector('[data-testid="block-live"]') as HTMLElement)).toContain(
      'No open invitations',
    );
    fixture.componentInstance.reason = 'Safety breach on site 4';
    fixture.componentInstance.confirm();
    http.expectOne('/api/v1/subcontractors/s1/status');
  });

  it('does not read live work for a move other than Block', () => {
    const { http, fixture, element } = render(ALL);
    [...element.querySelectorAll<HTMLButtonElement>('.prj-head button')]
      .find((b) => text(b).trim() === 'Deactivate')!
      .click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="block-live"]')).toBeNull();
    http.expectNone('/api/v1/subcontractors/s1/engagements');
  });

  it('styles Deactivate and Lift block as secondary and Block as danger; each asks first (CF-102 AC2b)', () => {
    const { fixture, element } = render(ALL);
    const actions = () =>
      [...element.querySelectorAll<HTMLButtonElement>('.prj-head .prj-actions button')].map(
        (button) => ({ label: text(button).trim(), classes: [...button.classList], button }),
      );
    const deactivate = actions().find((action) => action.label === 'Deactivate')!;
    const block = actions().find((action) => action.label === 'Block')!;
    expect(deactivate.classes).toContain('prj-btn--ghost');
    expect(deactivate.classes).not.toContain('prj-btn--danger');
    expect(block.classes).toContain('prj-btn--danger');
    expect(block.classes).not.toContain('prj-btn--ghost');
    for (const action of [deactivate, block]) {
      action.button.click();
      fixture.detectChanges();
      expect(element.querySelector('[role="dialog"]'), action.label).not.toBeNull();
      fixture.componentInstance.dismiss();
      fixture.detectChanges();
    }
    TestBed.resetTestingModule();
    const blocked = render(ALL, {
      ...detail,
      status: 'Blocked',
      statusReason: 'Safety breach',
      allowedNextStatuses: ['Inactive'],
    });
    const lift = [
      ...blocked.element.querySelectorAll<HTMLButtonElement>('.prj-head .prj-actions button'),
    ].find((button) => text(button).trim() === 'Lift block')!;
    expect(lift.classList).toContain('prj-btn--ghost');
    expect(lift.classList).not.toContain('prj-btn--danger');
    TestBed.resetTestingModule();
    const inactive = render(ALL, {
      ...detail,
      status: 'Inactive',
      allowedNextStatuses: ['Active'],
    });
    const activate = [
      ...inactive.element.querySelectorAll<HTMLButtonElement>('.prj-head .prj-actions button'),
    ].find((button) => text(button).trim() === 'Activate')!;
    // The forward move stays primary (ADR-156 §2).
    expect(activate.classList).not.toContain('prj-btn--ghost');
    expect(activate.classList).not.toContain('prj-btn--danger');
  });
});

describe('subcontractor form', () => {
  it('creates with the code and without contact ids, and blocks invalid input before sending', () => {
    const http = configure(ALL);
    const fixture = TestBed.createComponent(SubcontractorForm);
    fixture.detectChanges();
    http.expectOne('/api/v1/trades').flush([hvac, legacy]);
    const form = fixture.componentInstance;
    // Only active trades are offered for a new record.
    expect(form.selectableTrades().map((trade) => trade.code)).toEqual(['HVAC']);
    form.code = 'x';
    form.save();
    http.expectNone('/api/v1/subcontractors');

    form.code = ' acme-02 ';
    form.legalName = ' Acme Two ';
    form.commercialRegistration = ' ';
    form.toggleTrade('t1', true);
    form.addContact();
    form.contacts[0].name = 'Omar';
    form.contacts[0].email = 'omar@acme.example';
    form.save();
    const request = http.expectOne('/api/v1/subcontractors');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      code: 'acme-02',
      legalName: 'Acme Two',
      commercialRegistrationNumber: null,
      tradeIds: ['t1'],
      contacts: [{ id: null, name: 'Omar', email: 'omar@acme.example', isPrimary: true }],
    });
    request.flush(detail);
  });

  it('moves focus to the first invalid field when an incomplete record is submitted (CF-020)', async () => {
    const http = configure(ALL);
    TestBed.inject(InvalidSubmitFocus).start();
    const fixture = TestBed.createComponent(SubcontractorForm);
    fixture.autoDetectChanges();
    http.expectOne('/api/v1/trades').flush([hvac]);
    const element = fixture.nativeElement as HTMLElement;
    document.body.appendChild(element);
    const submit = element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.focus();
    element
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await (async () => {
      for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
    })();
    expect(document.activeElement?.id).toBe('code');
    expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true');
    http.expectNone('/api/v1/subcontractors');
    // CF-020 AC2: a polite summary first in the form names every invalid field and links to it.
    const summary = element.querySelector('form .prj-error-summary')!;
    expect(summary.getAttribute('aria-live')).toBe('polite');
    expect(element.querySelector('form')!.firstElementChild!.tagName).toBe('APP-ERROR-SUMMARY');
    const links = [...summary.querySelectorAll('a')];
    expect(summary.textContent).toContain(`${links.length} fields need attention`);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['#code', '#legal-name']),
    );
    expect(links[0].textContent).toContain('Subcontractor code');
    links[1].click();
    expect(document.activeElement?.id).toBe(links[1].getAttribute('href')!.slice(1));
    element.remove();
  });

  it('edits with the version, keeps contact identity and a retired trade the record carries, and never sends the code', () => {
    const http = configure(ALL, { id: 's1' });
    const fixture = TestBed.createComponent(SubcontractorForm);
    fixture.detectChanges();
    http.expectOne('/api/v1/trades').flush([hvac, legacy, unused]);
    http.expectOne('/api/v1/subcontractors/s1').flush(detail);
    fixture.detectChanges();
    const form = fixture.componentInstance;
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#code')?.readOnly,
    ).toBe(true);
    expect(form.selectableTrades().map((trade) => trade.code)).toEqual(['HVAC', 'OLD']);
    form.city = 'Giza';
    form.save();
    const request = http.expectOne('/api/v1/subcontractors/s1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.code).toBeUndefined();
    expect(request.request.body.version).toBe('v1');
    expect(request.request.body.tradeIds).toEqual(['t1', 't2']);
    expect(request.request.body.contacts).toEqual([
      {
        id: 'c1',
        name: 'Nadia Fouad',
        jobTitle: 'Estimator',
        email: 'nadia@acme.example',
        phone: '+20 100',
        isPrimary: true,
      },
    ]);
    request.flush(detail);
  });
});

describe('trade management', () => {
  it('adds trades and asks before retiring one, stating that carriers keep it', () => {
    const http = configure(ALL);
    const fixture = TestBed.createComponent(TradesAdmin);
    fixture.detectChanges();
    http.expectOne('/api/v1/trades').flush([hvac]);
    fixture.detectChanges();
    const admin = fixture.componentInstance;
    admin.code = 'elec';
    admin.name = 'Electrical';
    admin.create();
    const created = http.expectOne((r) => r.url === '/api/v1/trades' && r.method === 'POST');
    expect(created.request.body).toEqual({ code: 'elec', name: 'Electrical' });
    created.flush({ ...hvac, id: 't9', code: 'ELEC', name: 'Electrical' });
    http.expectOne((r) => r.url === '/api/v1/trades' && r.method === 'GET').flush([hvac]);
    fixture.detectChanges();

    admin.toggle(hvac);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('Subcontractors that already carry it keep it.');
    expect(text(element)).toContain('1 subcontractor carries it.');
    admin.confirmRetire();
    const retire = http.expectOne('/api/v1/trades/t1/status');
    expect(retire.request.body).toEqual({ isActive: false, version: 'tv1' });
    retire.flush({ ...hvac, isActive: false });
    http.expectOne('/api/v1/trades').flush([{ ...hvac, isActive: false }]);
  });
});

describe('category mapping (CF-027)', () => {
  it('lists stored category text with how it is read, and maps one to a trade', () => {
    const http = configure(ALL);
    const fixture = TestBed.createComponent(TradesAdmin);
    fixture.detectChanges();
    http.expectOne('/api/v1/trades').flush([hvac]);
    http.expectOne('/api/v1/category-mappings').flush([
      {
        sourceKey: 'ELECTRIC',
        label: 'electric',
        workPackages: 2,
        closeouts: 1,
        resolution: 'Unmapped',
        tradeId: null,
        tradeCode: null,
        tradeName: null,
        mappedAtUtc: null,
        mappedByName: null,
      },
    ]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('Category mapping');
    expect(text(element)).toContain('Not mapped — its own history bucket');
    const admin = fixture.componentInstance;
    admin.mappingChoice['ELECTRIC'] = 't1';
    admin.saveMapping(admin.mappings()![0]);
    const saved = http.expectOne(
      (r) => r.url === '/api/v1/category-mappings' && r.method === 'PUT',
    );
    expect(saved.request.body).toEqual({ sourceKey: 'ELECTRIC', tradeId: 't1' });
    saved.flush([
      {
        sourceKey: 'ELECTRIC',
        label: 'electric',
        workPackages: 2,
        closeouts: 1,
        resolution: 'Manual',
        tradeId: 't1',
        tradeCode: 'HVAC',
        tradeName: 'HVAC',
        mappedAtUtc: '2026-10-01T09:00:00Z',
        mappedByName: 'Maha Manager',
      },
    ]);
    fixture.detectChanges();
    expect(text(element)).toContain('Mapping saved.');
    expect(admin.mappingChoice['ELECTRIC']).toBe('t1');
  });
});

describe('history where firms are chosen (CF-014)', () => {
  const features = (list: readonly string[]) =>
    (
      TestBed.inject(EntitlementsService) as unknown as {
        current: { set: (value: readonly string[]) => void };
      }
    ).current.set(list);

  it('shows each directory row its closeout history, or that there is none', () => {
    const http = configure(ALL);
    const fixture = TestBed.createComponent(SubcontractorsList);
    fixture.detectChanges();
    http.expectOne('/api/v1/trades').flush([]);
    http
      .expectOne((r) => r.url === '/api/v1/subcontractors')
      .flush(
        page([
          {
            ...summary,
            history: { closeouts: 3, categories: 2, latestClosedAtUtc: '2026-09-01T10:00:00Z' },
          },
          {
            ...summary,
            id: 's2',
            code: 'BETA-01',
            history: { closeouts: 0, categories: 0, latestClosedAtUtc: null },
          },
          { ...summary, id: 's3', code: 'GAMA-01' },
        ]),
      );
    fixture.detectChanges();
    const chips = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="directory-history"]',
      ),
    ].map((chip) => text(chip as HTMLElement).trim());
    expect(chips).toHaveLength(2);
    expect(chips[0]).toContain('3 finalized closeouts in 2 categories · latest');
    expect(chips[1]).toBe('No closeout history yet');
  });

  function profile(permissions: readonly string[], plan: readonly string[]) {
    const http = configure(permissions, { id: 's1' });
    features(plan);
    const fixture = TestBed.createComponent(SubcontractorDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/subcontractors/s1').flush(detail);
    fixture.detectChanges();
    return { http, fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('summarizes the firm above the fold and keeps one delivery section', async () => {
    const { http, fixture, element } = profile(
      [...ALL, 'Intelligence.View', 'Performance.View'],
      INTELLIGENCE_FEATURES,
    );
    const isProfile = (r: { url: string }) => r.url === '/api/v1/intelligence/subcontractors/s1';
    http.expectOne(isProfile).flush(fullProfile());
    fixture.detectChanges();
    for (const next of http.match(isProfile))
      next.flush({ ...fullProfile(), categoryKey: 'MECHANICAL', category: 'Mechanical' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const strip = element.querySelector('[data-testid="intel-summary"]')!;
    expect(strip).not.toBeNull();
    expect(text(strip as HTMLElement)).toContain('History in Mechanical');
    expect(text(strip as HTMLElement)).toContain('1 finalized closeout (Limited evidence)');
    expect(text(strip as HTMLElement)).toContain(
      'Response reliability 50.0 % (1 of 2 valid invitations)',
    );
    // The strip comes before the directory sections, and the project-performance section is not repeated.
    expect(
      strip.compareDocumentPosition(element.querySelector('#overview-title')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(http.match('/api/v1/performance/subcontractors/s1')).toHaveLength(0);
    expect(text(element)).not.toContain('Project performance');
  });

  it('keeps the project performance history when the plan has no intelligence', () => {
    const { http, element } = profile([...ALL, 'Performance.View'], PERFORMANCE_FEATURES);
    expect(http.match('/api/v1/performance/subcontractors/s1')).toHaveLength(1);
    expect(element.querySelector('[data-testid="intel-summary"]')).toBeNull();
    expect(text(element)).toContain('Project performance');
  });
});

describe('contact erasure (CF-071)', () => {
  it('erases a non-primary contact in two steps and never offers the primary one', () => {
    const http = configure([...ALL, 'Company.ManageData'], { id: 's1' });
    const fixture = TestBed.createComponent(SubcontractorDetailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/subcontractors/s1').flush({
      ...detail,
      contacts: [
        ...detail.contacts,
        {
          id: 'c2',
          name: 'Sami Second',
          jobTitle: 'Site',
          email: 'sami@acme.example',
          phone: null,
          isPrimary: false,
        },
      ],
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const offers = Array.from(element.querySelectorAll('button')).filter((candidate) =>
      candidate.textContent?.includes('Erase personal data'),
    );
    expect(offers).toHaveLength(1);
    offers[0].click();
    fixture.detectChanges();
    (
      Array.from(element.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes('Confirm: erase permanently'),
      ) as HTMLButtonElement
    ).click();
    const request = http.expectOne('/api/v1/subcontractors/s1/contacts/c2/erase');
    expect(request.request.body).toEqual({ version: 'v1' });
    request.flush({
      ...detail,
      version: 'v2',
      contacts: [
        ...detail.contacts,
        {
          id: 'c2',
          name: 'Erased contact',
          jobTitle: null,
          email: null,
          phone: null,
          isPrimary: false,
        },
      ],
    });
    fixture.detectChanges();
    expect(text(element)).toContain("The contact's name, job title, email and phone were erased.");
    expect(text(element)).not.toContain('sami@acme.example');
  });
});
