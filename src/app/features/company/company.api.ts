import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from, shareReplay, switchMap } from 'rxjs';

export const COMPANY_PROFILE_PERMISSION = 'CompanyProfile.Manage';
export const LOGO_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg';
export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_MAX_PIXELS = 4096;

export interface Currency {
  readonly code: string;
  readonly name: string;
  readonly minorUnits: number;
}

/** The company profile. A null default currency means "not configured" — the product never guesses one. */
export interface CompanyProfile {
  readonly companyName: string;
  readonly defaultCurrency: string | null;
  readonly hasLogo: boolean;
  readonly logoContentType: string | null;
  readonly logoWidth: number | null;
  readonly logoHeight: number | null;
  readonly logoUpdatedAtUtc: string | null;
  readonly canManage: boolean;
  readonly version: string;
}

/** Currencies the workspace's forms offer first: the target markets and the common trading currencies. */
export const COMMON_CURRENCIES: readonly string[] = [
  'QAR',
  'SAR',
  'AED',
  'KWD',
  'BHD',
  'OMR',
  'EGP',
  'JOD',
  'USD',
  'EUR',
  'GBP',
];

@Injectable({ providedIn: 'root' })
export class CompanyApi {
  private readonly http = inject(HttpClient);
  private catalogue$?: Observable<readonly Currency[]>;

  /** The ISO catalogue is the same for every company and screen: fetched once per page load. */
  currencies(): Observable<readonly Currency[]> {
    this.catalogue$ ??= this.http
      .get<readonly Currency[]>('/api/v1/company/currencies')
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.catalogue$;
  }

  profile(): Observable<CompanyProfile> {
    return this.http.get<CompanyProfile>('/api/v1/company/profile');
  }

  setDefaultCurrency(currency: string, version: string): Observable<CompanyProfile> {
    return this.http.put<CompanyProfile>('/api/v1/company/profile/currency', { currency, version });
  }

  uploadLogo(file: File, version: string): Observable<CompanyProfile> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('version', version);
    return this.http.post<CompanyProfile>('/api/v1/company/profile/logo', form);
  }

  removeLogo(version: string): Observable<CompanyProfile> {
    return this.http.post<CompanyProfile>('/api/v1/company/profile/logo/remove', { version });
  }

  /** The logo as a data URL (the page's image policy allows same-origin and data images only). */
  logo(): Observable<string> {
    return this.http
      .get('/api/v1/company/profile/logo', { responseType: 'blob' })
      .pipe(switchMap((blob) => from(blobToDataUrl(blob))));
  }
}

/** Reads an image blob into a data URL for an <img>. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** ADR-084: from when a bid's validity period runs. */
export type ValidityBasis = 'SubmissionDeadline' | 'RevisionSubmission';

/** ADR-084: the company's procurement governance settings (new-company defaults until a Company Admin saves them). */
export interface ProcurementGovernance {
  readonly companyAdminActsInProcurement: boolean;
  readonly minimumCompliantBids: number;
  /** Percent as a decimal string, e.g. "0" or "5.5". */
  readonly overBudgetTolerancePercent: string;
  readonly validityBasis: ValidityBasis;
  /** CF-055 (ADR-092): every tender must state its VAT basis before publication (the company's choice, never its country's). */
  readonly pricingBasisRequired: boolean;
  /** CF-130 (ADR-097): four eyes on shortlist approval and tender publication. */
  readonly requireIndependentShortlistApproval?: boolean;
  readonly requireIndependentPublish?: boolean;
  /** CF-057 (OD-10): the largest package estimate for the low-value fast path, exact; null when off. */
  readonly fastPathMaximumValue?: string | null;
  readonly fastPathCurrency?: string | null;
  /** CF-045 (ADR-099, OD-09): how many times a firm may revise its submitted bid before the deadline (0: final). */
  readonly maximumBidResubmissions?: number;
  /** CF-086 (ADR-101): the shortest bid period at publication, and the period under which publishing warns. */
  readonly minimumBidPeriodHours?: number;
  readonly normalBidPeriodDays?: number;
  /** CF-058 (ADR-102, OD-11): bids received outside the portal may be recorded (off by default). */
  readonly outsidePortalBidsAllowed?: boolean;
  /** CF-040 (ADR-105): which tenders declare their evaluation and recommendation criteria before publication. */
  readonly criteriaDeclaration?: CriteriaDeclarationRule;
  /** CF-043 (ADR-106): the evaluation panel minimum, the divergence threshold (points) and whether divergence needs moderation. */
  readonly minimumScorecardsPerBid?: number;
  readonly divergenceThresholdPoints?: number;
  readonly moderationRequired?: boolean;
  /** CF-047 (ADR-111): when "not selected" notices go out by default. */
  readonly outcomeNoticeTiming?: OutcomeNoticeTiming;
  /** CF-010: optional target durations in days (null: none). */
  readonly evaluationTargetDays?: number | null;
  readonly approvalTargetDays?: number | null;
  readonly closeoutTargetDays?: number | null;
  readonly isDefault: boolean;
  readonly canManage: boolean;
  readonly updatedAtUtc: string | null;
  readonly version: string;
}

export interface ProcurementGovernanceUpdate {
  readonly companyAdminActsInProcurement: boolean;
  readonly minimumCompliantBids: number;
  readonly overBudgetTolerancePercent: string;
  readonly validityBasis: ValidityBasis;
  readonly pricingBasisRequired: boolean;
  readonly requireIndependentShortlistApproval: boolean;
  readonly requireIndependentPublish: boolean;
  readonly fastPathEnabled: boolean;
  readonly fastPathMaximumValue: string | null;
  readonly fastPathCurrency: string | null;
  readonly maximumBidResubmissions: number;
  readonly minimumBidPeriodHours: number;
  readonly normalBidPeriodDays: number;
  readonly outsidePortalBidsAllowed: boolean;
  readonly criteriaDeclaration: CriteriaDeclarationRule;
  readonly minimumScorecardsPerBid: number;
  readonly divergenceThresholdPoints: number;
  readonly moderationRequired: boolean;
  readonly outcomeNoticeTiming: OutcomeNoticeTiming;
  /** CF-010: 0 removes a target. */
  readonly evaluationTargetDays: number;
  readonly approvalTargetDays: number;
  readonly closeoutTargetDays: number;
  readonly version: string;
}

export type OutcomeNoticeTiming = 'OnAcceptance' | 'AtAward';

export type CriteriaDeclarationRule = 'NotRequired' | 'Rfp' | 'AllTenders';

@Injectable({ providedIn: 'root' })
export class GovernanceApi {
  private readonly http = inject(HttpClient);

  get(): Observable<ProcurementGovernance> {
    return this.http.get<ProcurementGovernance>('/api/v1/company/governance');
  }

  update(request: ProcurementGovernanceUpdate): Observable<ProcurementGovernance> {
    return this.http.put<ProcurementGovernance>('/api/v1/company/governance', request);
  }
}
