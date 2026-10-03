import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LOCALE_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { clearTranslations, loadTranslations } from '@angular/localize';
import arabicMessages from '../../../locale/messages.ar.json';

// A separate spec file: the translated template is cached on first render, so the Arabic catalogue
// must be loaded before the components are created in this module graph.
registerLocaleData(localeAr);
loadTranslations(arabicMessages.translations);
const localize = $localize as { locale?: string };
const previousLocale = localize.locale;
localize.locale = 'ar';
afterAll(() => {
  clearTranslations();
  localize.locale = previousLocale;
});

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

describe('Tendering in Arabic', () => {
  it('uses the procurement glossary, Arabic plurals and left-to-right identifiers with no English copy', async () => {
    const { SessionService } = await import('../../core/auth/session.service');
    const { TenderControl } = await import('./tender-control');
    const { TenderBuilder } = await import('./tender-builder');
    const { published, tender, invitation } = await import('./tendering.fixtures');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'ar' },
      ],
    });
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['ProcurementOfficer'],
      permissions: ['Tenders.View', 'Tenders.Edit', 'Tenders.ManageInvitations'],
    });
    TestBed.inject(HttpTestingController);

    const control = TestBed.createComponent(TenderControl);
    control.componentRef.setInput(
      'tender',
      published({
        reminders: [
          {
            daysBefore: 3,
            dueAtUtc: '2026-10-12T11:00:00Z',
            status: 'Scheduled',
            processedAtUtc: null,
            queuedCount: 0,
            skipReason: null,
          },
          {
            daysBefore: 1,
            dueAtUtc: '2026-10-14T11:00:00Z',
            status: 'Scheduled',
            processedAtUtc: null,
            queuedCount: 0,
            skipReason: null,
          },
        ],
        invitations: [
          invitation({
            status: 'Declined',
            declineReason: 'TimelineTooShort',
            canRemind: false,
            canResend: false,
          }),
        ],
      }),
    );
    control.detectChanges();
    const element = control.nativeElement as HTMLElement;
    const content = text(element);
    expect(content).toContain('الدعوات');
    expect(content).toContain('قبِلها خادم البريد');
    expect(content).toContain('المدة الزمنية قصيرة جدًا');
    expect(content).toContain('قبل 3 أيام');
    expect(content).toContain('قبل يوم واحد');
    expect(content).toContain('التفاصيل');
    // Dates use the Arabic comma, while the zone and offset stay readable.
    expect(content).toContain(
      '15 أكتوبر 2026، 14:00 (\u2066Asia/Riyadh\u2069، \u2066UTC+03:00\u2069)',
    );
    // The localized date is an Arabic phrase: isolated, but never forced left-to-right.
    const date = [...element.querySelectorAll('bdi')].find((node) =>
      node.textContent?.includes('Asia/Riyadh'),
    );
    expect(date?.getAttribute('dir')).toBeNull();
    // Identifiers and email addresses keep their own left-to-right order inside the Arabic page.
    const code = [...element.querySelectorAll('bdi[dir="ltr"]')].map((node) => node.textContent);
    expect(code).toContain('ACME-01');
    expect(code).toContain('rana@acme.example');
    for (const english of [
      'Invitations',
      'Accepted by mail server',
      'Declined',
      'days before',
      'Not opened',
      'Details',
    ])
      expect(content).not.toContain(english);

    const builder = TestBed.createComponent(TenderBuilder);
    builder.componentRef.setInput('tender', tender());
    builder.detectChanges();
    builder.componentInstance.go('dates');
    builder.detectChanges();
    const dates = text(builder.nativeElement as HTMLElement);
    expect(dates).toContain('المواعيد والتذكيرات');
    expect(dates).toContain('التذكيرات التلقائية');
    expect(dates).toContain('قبل يومين');
    for (const english of ['Time zone', 'Automatic reminders', 'Save and continue', 'Basics'])
      expect(dates).not.toContain(english);
  });

  it('warns in Arabic before publishing when no scorecard policy is active, naming the roles (CF-013 AC3)', async () => {
    const { SessionService } = await import('../../core/auth/session.service');
    const { EntitlementsService } = await import('../../core/auth/entitlements.service');
    const { TenderBuilder } = await import('./tender-builder');
    const { tender } = await import('./tendering.fixtures');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'ar' },
      ],
    });
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['ProcurementManager'],
      permissions: ['Tenders.View', 'Tenders.Edit', 'Tenders.Publish', 'Evaluation.View'],
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(EntitlementsService).load().subscribe();
    http.expectOne('/api/v1/company/features').flush({
      features: ['projects', 'subcontractor_directory', 'sourcing', 'tendering', 'evaluation'],
    });
    const builder = TestBed.createComponent(TenderBuilder);
    builder.componentRef.setInput('tender', tender());
    builder.detectChanges();
    builder.componentInstance.go('review');
    http.expectOne('/api/v1/tenders/t1/email-preview?kind=invitation').flush(null, {
      status: 500,
      statusText: 'Error',
    });
    http.expectOne('/api/v1/evaluation-policies').flush([{ status: 'Inactive' }]);
    http
      .expectOne('/api/v1/access/role-holders?permission=Evaluation.ManagePolicy')
      .flush({ roles: ['CompanyAdmin', 'ProcurementManager'] });
    builder.detectChanges();
    const warning = text(
      (builder.nativeElement as HTMLElement).querySelector('[data-testid="policy-warning"]')!,
    );
    expect(warning).toContain('لا توجد سياسة بطاقة تقييم مفعّلة');
    expect(warning).toContain('مسؤول الشركة أو مدير المشتريات');
    expect(warning).not.toMatch(/[A-Za-z]{3,}/);
  });

  it('keeps the missing-policy warning in Arabic without role names when the role holders cannot be read (re-audit O)', async () => {
    TestBed.resetTestingModule();
    const { SessionService } = await import('../../core/auth/session.service');
    const { EntitlementsService } = await import('../../core/auth/entitlements.service');
    const { TenderBuilder } = await import('./tender-builder');
    const { tender } = await import('./tendering.fixtures');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'ar' },
      ],
    });
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['ProcurementManager'],
      permissions: ['Tenders.View', 'Tenders.Edit', 'Tenders.Publish', 'Evaluation.View'],
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(EntitlementsService).load().subscribe();
    http.expectOne('/api/v1/company/features').flush({
      features: ['projects', 'subcontractor_directory', 'sourcing', 'tendering', 'evaluation'],
    });
    const builder = TestBed.createComponent(TenderBuilder);
    builder.componentRef.setInput('tender', tender());
    builder.detectChanges();
    builder.componentInstance.go('review');
    http.expectOne('/api/v1/tenders/t1/email-preview?kind=invitation').flush(null, {
      status: 500,
      statusText: 'Error',
    });
    http.expectOne('/api/v1/evaluation-policies').flush([{ status: 'Inactive' }]);
    http
      .expectOne('/api/v1/access/role-holders?permission=Evaluation.ManagePolicy')
      .flush(null, { status: 500, statusText: 'Error' });
    builder.detectChanges();
    const warning = text(
      (builder.nativeElement as HTMLElement).querySelector('[data-testid="policy-warning"]')!,
    );
    expect(warning).toContain('لا توجد سياسة بطاقة تقييم مفعّلة');
    expect(warning.trim()).toBe(
      'لا توجد سياسة بطاقة تقييم مفعّلة. يمكن استلام العطاءات، لكن لا يمكن بدء التقييم حتى تُفعَّل سياسة منها.',
    );
    expect(warning).not.toMatch(/[A-Za-z]{3,}/);
  });

  it('speaks correct Arabic on the bidder page: plural days and hours, validity, and dates not forced left-to-right', async () => {
    const { TenderInvitationPage } = await import('../bidder/tender-invitation');
    window.history.replaceState(null, '', '/tender-invitation#token=ar-token');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'ar' },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TenderInvitationPage);
    fixture.detectChanges();
    const deadline = new Date(Date.now() + (5 * 24 + 3) * 3_600_000 + 60_000).toISOString();
    http.expectOne('/api/v1/tender-invitations/open').flush({
      buyerCompanyName: 'Delta Construction',
      reference: 'TND-2026-0001',
      type: 'Rfq',
      title: 'HVAC',
      projectName: 'Tower',
      workPackageCode: 'WP-HVAC-01',
      workPackageTitle: 'HVAC works',
      scopeInstructions: 'Supply.',
      currency: 'SAR',
      bidValidityDays: 7,
      technicalProposalRequired: false,
      durationRequired: false,
      requiredDocuments: [],
      submissionInstructions: null,
      submissionDeadline: { utc: deadline, local: '2099-10-15T14:00', offset: '+03:00' },
      questionsDeadline: null,
      timeZoneId: 'Asia/Riyadh',
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      documents: [],
      publishedAtUtc: '2026-10-01T09:00:00Z',
      state: 'Open',
      subcontractorName: 'Acme',
      recipientName: 'Rana',
      invitationStatus: 'Invited',
      declineReason: null,
      canRespond: true,
      buyerPreview: false,
      linkAccess: 'Firm',
      revision: 2,
    });
    // Part 8: one addendum to acknowledge and one published clarification, in Arabic.
    http.expectOne('/api/v1/tender-invitations/communications').flush({
      myQuestions: [],
      published: [
        {
          id: 'c1',
          reference: 'CL-001',
          mine: false,
          question: 'هل تشمل الأعمال المبرد؟',
          askedAtUtc: null,
          status: 'Answered',
          visibility: 'AllBidders',
          answer: 'نعم.',
          answeredAtUtc: '2026-10-02T09:00:00Z',
          publishedQuestion: 'هل تشمل الأعمال المبرد؟',
          publishedAtUtc: '2026-10-02T09:00:00Z',
        },
      ],
      addenda: [
        {
          id: 'a1',
          number: 1,
          title: 'مخططات معدّلة',
          summary: 'تحل المراجعة 1 محل المراجعة 0.',
          issuedAtUtc: '2026-10-03T09:00:00Z',
          tenderRevision: 2,
          acknowledgementRequired: true,
          acknowledgedAtUtc: null,
          previousDeadline: null,
          newDeadline: null,
          addedDocuments: [],
          withdrawnDocuments: [],
        },
      ],
      canAsk: true,
      questionsClosedReason: null,
      questionMaxLength: 4000,
      outstandingAcknowledgements: 1,
      currentRevision: 2,
      canAcknowledge: true,
      serverTimeUtc: new Date().toISOString(),
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const content = text(element);
    expect(content).toContain('تحديث المناقصة');
    expect(content).toContain('أصدرت الجهة المشترية ملحقاً واحداً.');
    expect(content).toContain('الإقرار بالاستلام مطلوب');
    expect(content).toContain('التوضيحات المنشورة');
    expect(content).toContain('أرسلوا استفساراً إلى الجهة المشترية');
    for (const english of [
      'Tender updated',
      'Acknowledge receipt',
      'Published clarifications',
      'Your questions',
    ])
      expect(content).not.toContain(english);
    const reference = [...element.querySelectorAll('bdi')].find((node) =>
      node.textContent?.includes('CL-001'),
    );
    expect(reference?.getAttribute('dir')).toBe('ltr');
    expect(content).toContain('5 أيام');
    expect(content).toContain('3 ساعات');
    expect(content).toContain('صلاحية العطاء 7 أيام');
    const date = [...element.querySelectorAll('bdi')].find((node) =>
      node.textContent?.includes('Asia/Riyadh'),
    );
    expect(date?.getAttribute('dir')).toBeNull();
    expect(content).not.toContain('days');
    http.verify();
    // Spec files share one window: leave the address as other suites expect it.
    window.history.replaceState(null, '', '/');
  });
});

describe('Tender list and receipts in Arabic (red-team B-098-1, B-085-1)', () => {
  async function configureAr(permissions: readonly string[]) {
    const { SessionService } = await import('../../core/auth/session.service');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'ar' },
      ],
    });
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['ProcurementManager'],
      permissions,
    });
    return TestBed.inject(HttpTestingController);
  }

  it("shows the list deadline in the tender's zone in Arabic, with the UTC instant on hover", async () => {
    const { TenderList } = await import('./tender-list');
    const { tender } = await import('./tendering.fixtures');
    const http = await configureAr(['Tenders.View']);
    const list = TestBed.createComponent(TenderList);
    list.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/tenders')
      .flush({
        items: [
          {
            id: 't1',
            reference: 'TND-2026-0001',
            type: 'Rfq',
            title: 'أعمال التكييف',
            status: 'Published',
            deadlineState: 'Open',
            submissionDeadlineUtc: '2026-10-15T11:00:00Z',
            timeZoneId: 'Asia/Riyadh',
            workPackage: tender().workPackage,
            invitationCount: 3,
            intendsToBidCount: 1,
            declinedCount: 0,
            failedDeliveryCount: 0,
            updatedAtUtc: '2026-10-01T09:00:00Z',
            stage: 'OpenForBids',
            submissionDeadline: {
              utc: '2026-10-15T11:00:00Z',
              local: '2026-10-15T14:00',
              offset: '+03:00',
            },
          },
        ],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
      });
    list.detectChanges();
    const element = list.nativeElement as HTMLElement;
    const headers = [...element.querySelectorAll('thead th')].map((cell) =>
      text(cell as HTMLElement).trim(),
    );
    expect(headers).toContain('الموعد النهائي (بتوقيت المناقصة)');
    const cell = element.querySelector('tbody tr')!.querySelectorAll('td')[3] as HTMLElement;
    expect(text(cell).trim()).toBe('15 أكتوبر 2026، 14:00 (⁦Asia/Riyadh⁩، ⁦UTC+03:00⁩)');
    expect(cell.getAttribute('title')).toContain('2026');
    expect(cell.getAttribute('title')).toContain('UTC');
    const shown = text(element);
    expect(shown).not.toContain('Deadline');
    expect(shown).not.toMatch(/[٠-٩]/);
    http.verify();
  });

  it('counts and names a draft left by a firm that declined or was revoked, in Arabic', async () => {
    const { TenderControl } = await import('./tender-control');
    const { published } = await import('./tendering.fixtures');
    const http = await configureAr(['Tenders.View']);
    const control = TestBed.createComponent(TenderControl);
    control.componentRef.setInput('tender', published());
    control.detectChanges();
    const draft = {
      invitationId: 'i1',
      subcontractorCode: 'ACME-01',
      subcontractorName: 'أكمي',
      invitationStatus: 'Declined',
      bidReference: null,
      bidStatus: 'Draft',
      startedAtUtc: '2026-10-02T09:00:00Z',
      submittedAtUtc: null,
      revisionNumber: 1,
      submittedAttachmentCount: null,
      contentSha256: null,
      receiptEmailStatus: null,
    };
    for (const request of http.match((candidate) => candidate.url.endsWith('/bids')))
      request.flush({
        invited: 2,
        inProgress: 0,
        submitted: 0,
        contentSealed: true,
        draftsOfDeclinedFirms: 2,
        receipts: [draft, { ...draft, invitationId: 'i2', invitationStatus: 'Revoked' }],
      });
    control.detectChanges();
    const element = control.nativeElement as HTMLElement;
    const panels = [...element.querySelectorAll('dl.tnd-counts')];
    const counts = [...panels[panels.length - 1].querySelectorAll(':scope > div')].map((entry) => [
      text(entry.querySelector('dt') as HTMLElement).trim(),
      text(entry.querySelector('dd') as HTMLElement).trim(),
    ]);
    expect(counts).toContainEqual(['بدأ الإعداد ثم اعتذر أو أُلغيت الدعوة', '2']);
    const receipts = [...element.querySelectorAll('table')].find((table) =>
      text(table.querySelector('caption') as HTMLElement).includes('العطاءات المستلمة'),
    )!;
    const states = [...receipts.querySelectorAll('tbody tr')].map((row) =>
      text(row.querySelectorAll('td')[1] as HTMLElement).trim(),
    );
    expect(states).toEqual(['بدأ الإعداد ثم اعتذر', 'بدأ الإعداد ثم أُلغيت الدعوة']);
    const shown = text(element);
    for (const english of [
      'Started, then declined',
      'declined or revoked',
      'invitation revoked',
      'In progress',
    ])
      expect(shown).not.toContain(english);
  });
});
