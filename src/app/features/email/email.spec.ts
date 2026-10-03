import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { CompanyEmailPage } from './company-email';
import { CompanyEmailSettings, MailServer } from './email.api';
import { MailServerPanel } from './mail-server-panel';
import { PlatformEmailPage } from './platform-email';

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

function server(overrides: Partial<MailServer> = {}): MailServer {
  return {
    host: 'smtp.delta.example',
    port: 587,
    security: 'StartTls',
    authenticate: true,
    username: 'tenders',
    hasPassword: true,
    fromName: 'Delta Procurement',
    fromAddress: 'tenders@delta.example',
    replyToAddress: null,
    isEnabled: false,
    testStatus: 'NotTested',
    lastTestFailure: null,
    lastTestedAtUtc: null,
    lastTestedByName: null,
    updatedAtUtc: '2026-10-01T09:00:00Z',
    version: 'm1',
    ...overrides,
  };
}

function settings(overrides: Partial<CompanyEmailSettings> = {}): CompanyEmailSettings {
  return {
    customSmtpEntitled: true,
    requireCompanyServer: false,
    server: null,
    effectiveSender: {
      source: 'Platform',
      fromName: 'Delta via Bid Platform',
      fromAddress: 'noreply@platform.example',
      replyToAddress: null,
      ready: true,
      problem: null,
    },
    secretProtectionAvailable: true,
    ...overrides,
  };
}

function configure() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({
    userId: 'u1',
    tenantId: 't',
    email: 'admin@delta.example',
    roles: ['CompanyAdmin'],
    permissions: ['CompanyEmail.Manage'],
  });
  return TestBed.inject(HttpTestingController);
}

describe('company email delivery', () => {
  it('tells a company without the capability which service it uses and offers no server form', () => {
    const http = configure();
    const fixture = TestBed.createComponent(CompanyEmailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/company/email').flush(settings({ customSmtpEntitled: false }));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('Tender emails currently come from');
    expect(text(element)).toContain('noreply@platform.example');
    expect(text(element)).toContain("through the platform's mail service");
    expect(text(element)).toContain('part of the Company mail server capability');
    expect(element.querySelector('#mail-host')).toBeNull();
    http.verify();
  });

  it('lets a downgraded company switch off a dormant server that would otherwise return with the plan', () => {
    const http = configure();
    const fixture = TestBed.createComponent(CompanyEmailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/company/email').flush(
      settings({
        customSmtpEntitled: false,
        server: server({ isEnabled: true, version: 'sv9' }),
      }),
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('It is still switched on');
    fixture.componentInstance.switchOff('sv9');
    const request = http.expectOne('/api/v1/company/email/server/enabled');
    expect(request.request.body).toEqual({ enabled: false, version: 'sv9' });
    request.flush(settings({ customSmtpEntitled: false, server: server({ isEnabled: false }) }));
    fixture.detectChanges();
    expect(text(element)).not.toContain('It is still switched on');
    http.verify();
  });

  it('saves settings, keeps the password write-only, and allows enabling only after a passing test', () => {
    const http = configure();
    const fixture = TestBed.createComponent(CompanyEmailPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/company/email').flush(settings({ server: server() }));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('Configured · not tested yet');
    expect(text(element)).toContain('A password is stored (encrypted). It cannot be shown');
    expect((element.querySelector('#mail-password') as HTMLInputElement).value).toBe('');
    const enable = [...element.querySelectorAll('button')].find(
      (button) => text(button).trim() === 'Enable',
    ) as HTMLButtonElement;
    expect(enable.disabled).toBe(true);
    expect(text(element)).toContain(
      'A test message goes to your own address, admin@delta.example.',
    );

    const panel = fixture.debugElement.query(
      (node) => node.componentInstance instanceof MailServerPanel,
    ).componentInstance as MailServerPanel;
    panel.password = 'new-secret';
    panel.replacePassword();
    const credentials = http.expectOne('/api/v1/company/email/server/credentials');
    expect(credentials.request.body).toEqual({
      username: 'tenders',
      password: 'new-secret',
      version: 'm1',
    });
    expect(panel.password).toBe('');
    credentials.flush(settings({ server: server({ version: 'm2' }) }));
    http.expectOne('/api/v1/company/email').flush(settings({ server: server({ version: 'm2' }) }));
    fixture.detectChanges();

    panel.test();
    const test = http.expectOne('/api/v1/company/email/server/test');
    expect(test.request.body).toEqual({ version: 'm2' });
    test.flush({
      passed: false,
      failureCategory: 'authentication_failed',
      messageAccepted: false,
      server: server({ testStatus: 'Failed', version: 'm3' }),
    });
    http.expectOne('/api/v1/company/email').flush(
      settings({
        server: server({
          testStatus: 'Failed',
          lastTestFailure: 'authentication_failed',
          version: 'm3',
        }),
      }),
    );
    fixture.detectChanges();
    expect(text(element)).toContain(
      'Test failed: The mail server refused the user name or password.',
    );
    expect(text(element)).toContain('Last test failed · not in use');
    http.verify();
  });
});

describe('platform email', () => {
  it('edits a template as a new version with a preview and explains a stale save', () => {
    const http = configure();
    const fixture = TestBed.createComponent(PlatformEmailPage);
    fixture.detectChanges();
    http
      .expectOne('/api/v1/platform/email/server')
      .flush({ server: null, secretProtectionAvailable: true });
    http.expectOne('/api/v1/platform/email/templates').flush([
      { key: 'tender.invitation', locale: 'en', currentVersion: 0, updatedAtUtc: null },
      {
        key: 'tender.invitation',
        locale: 'ar',
        currentVersion: 2,
        updatedAtUtc: '2026-10-01T09:00:00Z',
      },
    ]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(text(element)).toContain('Tender invitation · English (version 0)');
    const page = fixture.componentInstance;
    page.open({ key: 'tender.invitation', locale: 'ar', currentVersion: 2, updatedAtUtc: null });
    http.expectOne('/api/v1/platform/email/templates/tender.invitation/ar').flush({
      key: 'tender.invitation',
      locale: 'ar',
      currentVersion: 2,
      subject: 'دعوة',
      body: '{{InvitationLink}}',
      builtInSubject: 'b',
      builtInBody: '{{InvitationLink}}',
      allowedPlaceholders: ['TenderTitle', 'InvitationLink'],
      requiredPlaceholders: ['InvitationLink'],
      versions: [
        { number: 2, createdAtUtc: '2026-10-01T09:00:00Z', createdBy: 'op' },
        { number: 0, createdAtUtc: null, createdBy: null },
      ],
    });
    fixture.detectChanges();
    expect(text(element)).toContain('{{TenderTitle}}');
    expect(element.querySelector('#template-body')?.getAttribute('dir')).toBe('rtl');
    page.subject = 'دعوة {{TenderTitle}}';
    page.showPreview();
    const preview = http.expectOne('/api/v1/platform/email/templates/tender.invitation/ar/preview');
    expect(preview.request.body).toEqual({
      subject: 'دعوة {{TenderTitle}}',
      body: '{{InvitationLink}}',
    });
    preview.flush({
      subject: 'دعوة أعمال',
      textBody: 'https://example.invalid',
      htmlBody: '<p></p>',
    });
    page.save();
    const save = http.expectOne('/api/v1/platform/email/templates/tender.invitation/ar');
    expect(save.request.body).toEqual({
      subject: 'دعوة {{TenderTitle}}',
      body: '{{InvitationLink}}',
      expectedVersion: 2,
    });
    save.flush({ code: 'concurrency.stale' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(text(element)).toContain('Someone saved a newer version of this template.');
    http.verify();
  });
});
