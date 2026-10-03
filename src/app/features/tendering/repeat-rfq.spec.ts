import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { knownProductProblem } from '../../core/localization/product-problem';
import { InvitationDialog } from './invitation-dialog';
import { TenderBuilder } from './tender-builder';
import { TenderOrigin } from './tender-origin';
import { TenderTemplatesPage } from './tender-templates';
import { TenderTemplate } from './tendering.api';
import { published, tender } from './tendering.fixtures';
import { WorkPackageTender } from './work-package-tender';

/** CF-057 / CF-084 (ADR-098): templates, copies of earlier tenders and inviting the whole shortlist. */
const FEATURES = ['projects', 'subcontractor_directory', 'sourcing', 'tendering'];
const OFFICER = ['Tenders.View', 'Tenders.Create', 'Tenders.Edit', 'Tenders.ManageInvitations'];

function configure(permissions: readonly string[]) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', children: [] }]),
    ],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({
    userId: 'u1',
    tenantId: 't',
    email: 'olaf@delta.example',
    roles: ['ProcurementOfficer'],
    permissions,
  });
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(EntitlementsService).load().subscribe();
  http.expectOne('/api/v1/company/features').flush({ features: FEATURES });
  return http;
}

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

function template(overrides: Partial<TenderTemplate> = {}): TenderTemplate {
  return {
    id: 'tpl1',
    name: 'HVAC standard RFQ',
    description: null,
    isActive: true,
    currentVersion: 2,
    versions: [
      {
        number: 2,
        createdAtUtc: '2026-09-30T10:00:00Z',
        createdByName: 'Olaf Officer',
        sourceTenderReference: 'TND-2026-0001',
        type: 'Rfq',
        title: 'HVAC installation',
        requiredDocuments: 3,
        documents: 1,
        scheduleItems: 12,
        hasPricing: true,
        hasTerms: true,
      },
    ],
    updatedAtUtc: '2026-09-30T10:00:00Z',
    version: 'tv2',
    ...overrides,
  };
}

const paged = <T>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 20,
  totalCount: items.length,
  totalPages: 1,
});

describe('Repeat RFQs (CF-057 / CF-084)', () => {
  it('starts a draft from a template or as a copy of an earlier tender of another package', () => {
    const http = configure(OFFICER);
    const fixture = TestBed.createComponent(WorkPackageTender);
    fixture.componentRef.setInput('workPackageId', 'wp2');
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/sourcing')
      .flush(paged([{ status: 'ShortlistApproved' }]));
    http.expectOne((request) => request.url === '/api/v1/tenders').flush(paged([]));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('Start from a template or an earlier tender');
    expect(text(element)).not.toContain('Create a copy');

    const page = fixture.componentInstance;
    page.loadSources();
    http
      .expectOne('/api/v1/tender-templates')
      .flush([template(), template({ id: 'tpl2', name: 'Retired', isActive: false })]);
    http
      .expectOne((request) => request.url === '/api/v1/tenders')
      .flush(
        paged([
          { id: 'old', reference: 'TND-2026-0001', title: 'HVAC', workPackage: { id: 'wp1' } },
          { id: 'same', reference: 'TND-2026-0002', title: 'Here', workPackage: { id: 'wp2' } },
        ]),
      );
    fixture.detectChanges();
    // Only active templates are offered; the package's own tenders are not offered as a source.
    expect(page.templates().map((item) => item.id)).toEqual(['tpl1']);
    expect(page.earlier().map((item) => item.id)).toEqual(['old']);
    expect(text(element)).toContain('HVAC standard RFQ · v2');

    page.templateId.set('tpl1');
    page.fromTemplate();
    const fromTemplate = http.expectOne('/api/v1/tenders/from-template');
    expect(fromTemplate.request.body).toEqual({ templateId: 'tpl1', workPackageId: 'wp2' });
    fromTemplate.flush(tender({ id: 'new1' }));

    page.creating.set(false);
    page.copyId.set('old');
    page.includeDocuments.set(false);
    page.copy();
    const clone = http.expectOne('/api/v1/tenders/old/clone');
    expect(clone.request.body).toEqual({ workPackageId: 'wp2', includeDocuments: false });
    clone.flush(tender({ id: 'new2' }));
    http.verify();
  });

  it('invites the whole approved shortlist in one action and lists the firms it skipped', () => {
    const http = configure(OFFICER);
    const fixture = TestBed.createComponent(TenderBuilder);
    fixture.componentRef.setInput('tender', tender());
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.go('invitees');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('Invite all shortlisted (1)');
    page.inviteAll();
    const request = http.expectOne('/api/v1/tenders/t1/invitees/all-shortlisted');
    expect(request.request.body).toEqual({ version: 'v1' });
    request.flush({
      tender: tender({ version: 'v2' }),
      skipped: [{ subcontractorCode: 'GAMMA-01', reason: 'no_contact' }],
    });
    fixture.detectChanges();
    expect(text(element)).toContain('These firms were not invited:');
    expect(text(element)).toContain('GAMMA-01 — no contact with an email address');
    http.verify();
  });

  it('shows where a draft came from and saves the tender as a new template version', () => {
    const http = configure(OFFICER);
    const fixture = TestBed.createComponent(TenderOrigin);
    fixture.componentRef.setInput(
      'tender',
      tender({
        origin: {
          templateId: 'tpl1',
          templateName: 'HVAC standard RFQ',
          templateVersion: 2,
          clonedFromTenderId: null,
          clonedFromReference: null,
        },
      }),
    );
    const announced: string[] = [];
    fixture.componentInstance.announce.subscribe((message) => announced.push(message));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('Made from template HVAC standard RFQ, version 2.');

    const page = fixture.componentInstance;
    page.loadTemplates();
    http.expectOne('/api/v1/tender-templates').flush([template()]);
    page.target = 'tpl1';
    page.includeDocuments = false;
    page.save();
    const save = http.expectOne('/api/v1/tender-templates');
    expect(save.request.method).toBe('POST');
    expect(save.request.body).toEqual({
      tenderId: 't1',
      name: null,
      description: null,
      includeDocuments: false,
      templateId: 'tpl1',
      version: 'tv2',
    });
    save.flush(template({ currentVersion: 3 }));
    expect(announced).toEqual(['Saved as template HVAC standard RFQ, version 3.']);
    http.verify();
  });

  it('lists template versions and stops offering a template without deleting it', () => {
    const http = configure(OFFICER);
    const fixture = TestBed.createComponent(TenderTemplatesPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/tender-templates').flush([template()]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain(
      '3 required documents · 1 tender documents · 12 schedule items',
    );
    expect(text(element)).toContain('TND-2026-0001');
    fixture.componentInstance.setActive(template(), false);
    const update = http.expectOne('/api/v1/tender-templates/tpl1');
    expect(update.request.body).toEqual({
      name: 'HVAC standard RFQ',
      description: null,
      isActive: false,
      version: 'tv2',
    });
    update.flush(template({ isActive: false, version: 'tv3' }));
    fixture.detectChanges();
    expect(text(element)).toContain('Not offered');
    expect(text(element)).toContain('Offer again');
    http.verify();
  });

  it('warns on review when the deadline is shorter than the company normal bid period (CF-086)', () => {
    const http = configure(OFFICER);
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const fixture = TestBed.createComponent(TenderBuilder);
    fixture.componentRef.setInput(
      'tender',
      tender({
        submissionDeadline: { utc: soon, local: soon.slice(0, 16), offset: '+00:00' },
        normalBidPeriodDays: 5,
        minimumBidPeriodHours: 24,
      }),
    );
    fixture.detectChanges();
    fixture.componentInstance.go('review');
    for (const request of http.match(() => true)) request.flush({});
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('less than 5 days to bid');
    expect(text(element)).toContain('refused below 24 hour(s)');
  });

  it('adds a second recipient of the same firm from the invitation dialog (CF-058)', () => {
    const http = configure(OFFICER);
    const detail = published();
    const invitation = detail.invitations[0];
    const fixture = TestBed.createComponent(InvitationDialog);
    fixture.componentRef.setInput('tender', detail);
    fixture.componentRef.setInput('invitation', invitation);
    fixture.detectChanges();
    for (const request of http.match(() => true)) request.flush({ events: [], deliveries: [] });
    const page = fixture.componentInstance;
    const candidates = page.secondOptions();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((contact) => contact.contactId !== invitation.contactId)).toBe(true);
    page.ask('second');
    page.run();
    const request = http.expectOne(
      `/api/v1/tenders/${detail.id}/invitations/${invitation.id}/second-recipient`,
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      contactId: candidates[0].contactId,
      version: invitation.version,
    });
  });

  it('explains the new refusals', () => {
    expect(knownProductProblem({ code: 'tender_template.inactive' })).toContain(
      'no longer offered',
    );
    expect(
      knownProductProblem({
        code: 'sourcing.fast_path_unavailable',
        parameters: { reason: 'value' },
      }),
    ).toContain('fast-path limit');
    expect(
      knownProductProblem({
        code: 'sourcing.fast_path_firm_not_approved',
        parameters: { codes: 'BETA-01' },
      }),
    ).toContain('BETA-01');
  });
});
