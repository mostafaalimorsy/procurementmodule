import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type MailSecurity = 'StartTls' | 'Tls' | 'None';
export type MailTestStatus = 'NotTested' | 'Passed' | 'Failed';

export const COMPANY_EMAIL_PERMISSION = 'CompanyEmail.Manage';
export const MAIL_SECURITY: readonly MailSecurity[] = ['StartTls', 'Tls', 'None'];

/** A mail server as the API returns it. The stored password is never returned — only whether one is set. */
export interface MailServer {
  readonly host: string;
  readonly port: number;
  readonly security: MailSecurity;
  readonly authenticate: boolean;
  readonly username: string | null;
  readonly hasPassword: boolean;
  readonly fromName: string | null;
  readonly fromAddress: string;
  readonly replyToAddress: string | null;
  readonly isEnabled: boolean;
  readonly testStatus: MailTestStatus;
  readonly lastTestFailure: string | null;
  readonly lastTestedAtUtc: string | null;
  readonly lastTestedByName: string | null;
  readonly updatedAtUtc: string;
  readonly version: string;
}

export interface SenderIdentity {
  readonly source: 'Platform' | 'Company' | null;
  readonly fromName: string | null;
  readonly fromAddress: string | null;
  readonly replyToAddress: string | null;
  readonly ready: boolean;
  readonly problem: string | null;
}

export interface CompanyEmailSettings {
  readonly customSmtpEntitled: boolean;
  readonly requireCompanyServer: boolean;
  readonly server: MailServer | null;
  readonly effectiveSender: SenderIdentity;
  readonly secretProtectionAvailable: boolean;
}

export interface PlatformEmailSettings {
  readonly server: MailServer | null;
  readonly secretProtectionAvailable: boolean;
}

export interface MailTestResult {
  readonly passed: boolean;
  readonly failureCategory: string | null;
  readonly messageAccepted: boolean;
  readonly server: MailServer;
}

export interface MailServerInput {
  readonly host: string;
  readonly port: number;
  readonly security: MailSecurity;
  readonly authenticate: boolean;
  readonly username: string | null;
  readonly fromName: string | null;
  readonly fromAddress: string;
  readonly replyToAddress: string | null;
  readonly requireCompanyServer: boolean;
}

export interface EmailTemplateSummary {
  readonly key: string;
  readonly locale: 'en' | 'ar';
  readonly currentVersion: number;
  readonly updatedAtUtc: string | null;
}

export interface EmailTemplateDetail {
  readonly key: string;
  readonly locale: 'en' | 'ar';
  readonly currentVersion: number;
  readonly subject: string;
  readonly body: string;
  readonly builtInSubject: string;
  readonly builtInBody: string;
  readonly allowedPlaceholders: readonly string[];
  readonly requiredPlaceholders: readonly string[];
  readonly versions: readonly {
    number: number;
    createdAtUtc: string | null;
    createdBy: string | null;
  }[];
}

export interface EmailPreview {
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody: string;
}

@Injectable({ providedIn: 'root' })
export class CompanyEmailApi {
  private readonly http = inject(HttpClient);

  get(): Observable<CompanyEmailSettings> {
    return this.http.get<CompanyEmailSettings>('/api/v1/company/email');
  }

  save(input: MailServerInput, version: string | null): Observable<CompanyEmailSettings> {
    return this.http.put<CompanyEmailSettings>('/api/v1/company/email/server', {
      ...input,
      version,
    });
  }

  replaceCredentials(
    username: string | null,
    password: string,
    version: string,
  ): Observable<CompanyEmailSettings> {
    return this.http.put<CompanyEmailSettings>('/api/v1/company/email/server/credentials', {
      username,
      password,
      version,
    });
  }

  test(version: string): Observable<MailTestResult> {
    return this.http.post<MailTestResult>('/api/v1/company/email/server/test', { version });
  }

  setEnabled(enabled: boolean, version: string): Observable<CompanyEmailSettings> {
    return this.http.put<CompanyEmailSettings>('/api/v1/company/email/server/enabled', {
      enabled,
      version,
    });
  }
}

@Injectable({ providedIn: 'root' })
export class PlatformEmailApi {
  private readonly http = inject(HttpClient);

  server(): Observable<PlatformEmailSettings> {
    return this.http.get<PlatformEmailSettings>('/api/v1/platform/email/server');
  }

  save(input: MailServerInput, version: string | null): Observable<PlatformEmailSettings> {
    return this.http.put<PlatformEmailSettings>('/api/v1/platform/email/server', {
      ...input,
      version,
    });
  }

  replaceCredentials(
    username: string | null,
    password: string,
    version: string,
  ): Observable<PlatformEmailSettings> {
    return this.http.put<PlatformEmailSettings>('/api/v1/platform/email/server/credentials', {
      username,
      password,
      version,
    });
  }

  test(recipient: string, version: string): Observable<MailTestResult> {
    return this.http.post<MailTestResult>('/api/v1/platform/email/server/test', {
      recipient,
      version,
    });
  }

  setEnabled(enabled: boolean, version: string): Observable<PlatformEmailSettings> {
    return this.http.put<PlatformEmailSettings>('/api/v1/platform/email/server/enabled', {
      enabled,
      version,
    });
  }

  templates(): Observable<readonly EmailTemplateSummary[]> {
    return this.http.get<readonly EmailTemplateSummary[]>('/api/v1/platform/email/templates');
  }

  template(key: string, locale: string): Observable<EmailTemplateDetail> {
    return this.http.get<EmailTemplateDetail>(this.templateUrl(key, locale));
  }

  saveTemplate(
    key: string,
    locale: string,
    subject: string,
    body: string,
    expectedVersion: number,
  ): Observable<EmailTemplateDetail> {
    return this.http.put<EmailTemplateDetail>(this.templateUrl(key, locale), {
      subject,
      body,
      expectedVersion,
    });
  }

  preview(key: string, locale: string, subject: string, body: string): Observable<EmailPreview> {
    return this.http.post<EmailPreview>(`${this.templateUrl(key, locale)}/preview`, {
      subject,
      body,
    });
  }

  private templateUrl(key: string, locale: string): string {
    return `/api/v1/platform/email/templates/${encodeURIComponent(key)}/${encodeURIComponent(locale)}`;
  }
}

export function securityLabel(security: string): string {
  return (
    (
      {
        StartTls: $localize`:@@mailSecurity.startTls:STARTTLS (usually port 587)`,
        Tls: $localize`:@@mailSecurity.tls:TLS from the start (usually port 465)`,
        None: $localize`:@@mailSecurity.none:No encryption (trusted internal relay only)`,
      } as Record<string, string>
    )[security] ?? security
  );
}

export function testStatusLabel(server: MailServer | null): string {
  if (!server) return $localize`:@@mailStatus.notConfigured:Not configured`;
  if (server.testStatus === 'Passed')
    return server.isEnabled
      ? $localize`:@@mailStatus.enabled:Test passed · in use`
      : $localize`:@@mailStatus.passedDisabled:Test passed · not enabled`;
  if (server.testStatus === 'Failed')
    return $localize`:@@mailStatus.failed:Last test failed · not in use`;
  return $localize`:@@mailStatus.notTested:Configured · not tested yet`;
}

export function templateLabel(key: string): string {
  return (
    (
      {
        'tender.invitation': $localize`:@@template.tenderInvitation:Tender invitation`,
        'tender.reminder': $localize`:@@template.tenderReminder:Tender reminder`,
        'tender.negotiation_request': $localize`:@@template.negotiationRequest:Negotiation round request`,
        'tender.award_selected': $localize`:@@template.awardSelected:Tender outcome — selected for award`,
        'tender.award_not_selected': $localize`:@@template.awardNotSelected:Tender outcome — not selected`,
        'tender.award_reserve_held': $localize`:@@template.awardReserveHeld:Bid held in reserve`,
        'tender.bid_received': $localize`:@@template.bidReceived:Bid received (receipt to the firm)`,
        'tender.cancelled': $localize`:@@template.tenderCancelled:Tender cancelled`,
        'tender.round_closed': $localize`:@@template.roundClosed:Negotiation round closed`,
        'tender.round_cancelled': $localize`:@@template.roundCancelled:Negotiation round cancelled`,
      } as Record<string, string>
    )[key] ?? key
  );
}

export function languageLabel(locale: string): string {
  return locale === 'ar'
    ? $localize`:@@tenderBuilder.arabic:Arabic`
    : $localize`:@@tenderBuilder.english:English`;
}
