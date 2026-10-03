import { ComplianceItem, VendorApprovalStatus } from '../subcontractors/compliance.api';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CriterionKey,
  CriterionOutcome,
  PrequalificationResult,
  SourcingStatus,
  SubcontractorStatus,
  criterionLabel,
  criterionOutcomeLabel,
  prequalificationResultLabel,
  sourcingStatusLabel,
} from '../../core/localization/labels';
import { problemMessage } from '../../core/localization/product-problem';
import { Paged } from '../subcontractors/subcontractors.api';

export type {
  CriterionKey,
  CriterionOutcome,
  PrequalificationResult,
  SourcingStatus,
} from '../../core/localization/labels';

export const SOURCING_PERMISSIONS = {
  view: 'Sourcing.View',
  manage: 'Sourcing.Manage',
  prequalify: 'Sourcing.Prequalify',
  approve: 'Sourcing.ApproveShortlist',
} as const;

/** Sourcing works on projects' work packages and directory subcontractors, so it needs all three. */
export const SOURCING_FEATURES: readonly string[] = [
  'sourcing',
  'projects',
  'subcontractor_directory',
];

/** The checklist in the order the product presents it. */
export const CRITERIA: readonly CriterionKey[] = [
  'tradeFit',
  'geographicCoverage',
  'capacity',
  'experience',
  'compliance',
  'risk',
  'pastPerformance',
];

export const CRITERION_OUTCOMES: readonly CriterionOutcome[] = ['Met', 'NotMet', 'NotAssessed'];
export const PREQUALIFICATION_RESULTS: readonly PrequalificationResult[] = [
  'Qualified',
  'NotQualified',
  'Pending',
];

export const RATIONALE_MAX = 1000;
export const REASON_MIN = 3;
export const REASON_MAX = 500;

export type Criteria = Readonly<Record<CriterionKey, CriterionOutcome>>;

export interface SourcingWorkPackage {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly category: string | null;
  readonly status: string;
  readonly projectId: string;
  readonly projectCode: string;
  readonly projectName: string;
  readonly projectStatus: string;
}

export interface SourcingSummary {
  readonly id: string;
  readonly workPackage: SourcingWorkPackage;
  readonly status: SourcingStatus;
  readonly candidateCount: number;
  readonly qualifiedCount: number;
  readonly shortlistedCount: number;
  readonly approvalCount: number;
  readonly updatedAtUtc: string;
  readonly approvalRequestedAtUtc?: string | null;
}

export interface SourcingTrade {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly isActive: boolean;
}

export interface CandidateTrade {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly matchesSourcing: boolean;
}

export interface SourcingCandidate {
  readonly id: string;
  readonly subcontractorId: string;
  readonly code: string;
  readonly legalName: string;
  readonly tradingName: string | null;
  readonly countryCode: string | null;
  readonly city: string | null;
  readonly directoryStatus: SubcontractorStatus;
  readonly trades: readonly CandidateTrade[];
  readonly result: PrequalificationResult;
  readonly criteria: Criteria;
  readonly rationale: string | null;
  readonly assessedAtUtc: string | null;
  readonly assessedByName: string | null;
  readonly isShortlisted: boolean;
  readonly isRemoved: boolean;
  readonly addedAtUtc: string;
  readonly removedAtUtc: string | null;
  /** CF-056: required compliance documents for the sourcing trades today, and the AVL status in them. */
  readonly compliance?: readonly ComplianceItem[] | null;
  readonly vendor?:
    readonly { readonly tradeId: string; readonly status: VendorApprovalStatus }[] | null;
  /** CF-033 (ADR-129): the evidence offered at the latest assessment (null: not recorded). */
  readonly evidence?: PrequalificationEvidence | null;
}

/** CF-033 (ADR-129): finalized closeouts in the package's category, their strength, and whether delivery details were shown. */
export interface PrequalificationEvidence {
  readonly completedProjects: number;
  readonly strength: 'None' | 'Limited' | 'Moderate' | 'Strong' | string;
  readonly deliveryShown: boolean;
}

export interface ShortlistApprovalMember {
  readonly subcontractorId: string;
  readonly code: string;
  readonly legalName: string;
  readonly statusAtApproval: SubcontractorStatus;
  readonly currentDirectoryStatus: SubcontractorStatus | null;
  readonly criteria: Criteria;
  readonly rationale: string | null;
  readonly assessedAtUtc: string | null;
  readonly assessedByName: string | null;
  /** CF-056: the compliance as it stood at approval (absent for approvals before it was recorded). */
  readonly complianceAtApproval?: readonly ComplianceItem[] | null;
  /** CF-033 (ADR-129): the evidence the member's prequalification was recorded with, as it stood at approval. */
  readonly evidence?: PrequalificationEvidence | null;
}

export interface ShortlistApproval {
  readonly id: string;
  readonly round: number;
  readonly approvedAtUtc: string;
  readonly approvedByName: string;
  readonly revokedAtUtc: string | null;
  readonly revokedByName: string | null;
  readonly revocationReason: string | null;
  readonly members: readonly ShortlistApprovalMember[];
  /** CF-057 (ADR-098, OD-10): approved on the low-value fast path. */
  readonly fastPath?: boolean | null;
}

export interface SourcingDetail {
  readonly id: string;
  readonly workPackage: SourcingWorkPackage;
  readonly status: SourcingStatus;
  /** A stable problem code saying why nothing can change now; null when editable. */
  readonly lockReason: string | null;
  readonly canApprove: boolean;
  readonly canReopen: boolean;
  readonly trades: readonly SourcingTrade[];
  readonly candidates: readonly SourcingCandidate[];
  readonly currentApproval: ShortlistApproval | null;
  readonly approvals: readonly ShortlistApproval[];
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
  readonly version: string;
  /** CF-130 (ADR-097): ready-for-approval marker and whether four eyes apply. */
  readonly approvalRequestedAtUtc?: string | null;
  readonly approvalRequestedByName?: string | null;
  readonly requireIndependentApproval?: boolean;
  /** CF-057 (OD-10): why the low-value fast path does not apply (off, four_eyes, value); null when it does. */
  readonly fastPathUnavailable?: 'off' | 'four_eyes' | 'value' | null;
}

export type CandidateState = 'none' | 'candidate' | 'removed';

export interface DiscoveryItem {
  readonly subcontractorId: string;
  readonly code: string;
  readonly legalName: string;
  readonly tradingName: string | null;
  readonly countryCode: string | null;
  readonly city: string | null;
  readonly directoryStatus: SubcontractorStatus;
  readonly trades: readonly CandidateTrade[];
  readonly matchesSourcingTrades: boolean;
  readonly candidateState: CandidateState;
  /** CF-014 (ADR-130): history in the package's category, for intelligence readers (absent otherwise). */
  readonly evidence?: DiscoveryEvidence | null;
}

/** CF-014 (ADR-130): counts only; the would-work-again pattern is null without performance access. */
export interface DiscoveryEvidence {
  readonly completedProjects: number;
  readonly strength: string;
  readonly latestClosedAtUtc: string | null;
  readonly wouldWorkAgainYes: number | null;
  readonly wouldWorkAgainConditional: number | null;
  readonly wouldWorkAgainNo: number | null;
}

export interface DiscoveryOptions {
  readonly search?: string;
  readonly tradeId?: string | null;
  readonly status?: readonly SubcontractorStatus[];
  readonly page?: number;
  readonly pageSize?: number;
}

export interface Assessment {
  readonly result: PrequalificationResult;
  readonly criteria: Criteria;
  readonly rationale: string | null;
}

/**
 * The sourcing HTTP surface. Every mutation sends the version the screen shows and returns the whole
 * refreshed sourcing, so the screen always holds exactly what the server decided.
 */
/** CF-103: a live work package without sourcing yet. */
export interface StartablePackage {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly projectCode: string;
  readonly projectName: string;
  readonly tradeId: string | null;
}

@Injectable({ providedIn: 'root' })
export class SourcingApi {
  private readonly http = inject(HttpClient);

  list(
    options: {
      status?: readonly SourcingStatus[];
      workPackageId?: string;
      page?: number;
      search?: string;
    } = {},
  ): Observable<Paged<SourcingSummary>> {
    let params = new HttpParams();
    if (options.search?.trim()) params = params.set('search', options.search.trim());
    for (const status of options.status ?? []) params = params.append('status', status);
    if (options.workPackageId) params = params.set('workPackageId', options.workPackageId);
    if (options.page) params = params.set('page', options.page);
    return this.http.get<Paged<SourcingSummary>>('/api/v1/sourcing', { params });
  }

  /** CF-103: live work packages without sourcing, for the "Start sourcing" picker. */
  startable(search: string): Observable<StartablePackage[]> {
    let params = new HttpParams();
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<StartablePackage[]>('/api/v1/sourcing/startable', { params });
  }

  get(id: string): Observable<SourcingDetail> {
    return this.http.get<SourcingDetail>(this.url(id));
  }

  start(workPackageId: string, tradeIds: readonly string[]): Observable<SourcingDetail> {
    return this.http.post<SourcingDetail>('/api/v1/sourcing', { workPackageId, tradeIds });
  }

  setTrades(id: string, tradeIds: readonly string[], version: string): Observable<SourcingDetail> {
    return this.http.put<SourcingDetail>(this.url(id), { tradeIds, version });
  }

  discover(id: string, options: DiscoveryOptions = {}): Observable<Paged<DiscoveryItem>> {
    let params = new HttpParams();
    if (options.search?.trim()) params = params.set('search', options.search.trim());
    if (options.tradeId) params = params.set('tradeId', options.tradeId);
    for (const status of options.status ?? []) params = params.append('status', status);
    if (options.page) params = params.set('page', options.page);
    if (options.pageSize) params = params.set('pageSize', options.pageSize);
    return this.http.get<Paged<DiscoveryItem>>(`${this.url(id)}/discovery`, { params });
  }

  addCandidate(id: string, subcontractorId: string, version: string): Observable<SourcingDetail> {
    return this.http.post<SourcingDetail>(`${this.url(id)}/candidates`, {
      subcontractorId,
      version,
    });
  }

  /** CF-057: several firms at once — all or none. */
  addCandidates(
    id: string,
    subcontractorIds: readonly string[],
    version: string,
  ): Observable<SourcingDetail> {
    return this.http.post<SourcingDetail>(`${this.url(id)}/candidates/bulk`, {
      subcontractorIds,
      version,
    });
  }

  /** CF-057: the same prequalification for several candidates. */
  assessMany(
    id: string,
    candidateIds: readonly string[],
    assessment: Assessment,
    version: string,
  ): Observable<SourcingDetail> {
    return this.http.post<SourcingDetail>(`${this.url(id)}/candidates/prequalification`, {
      candidateIds,
      ...assessment,
      version,
    });
  }

  /** CF-057 (OD-10): approved vendors added, qualified and the shortlist approved in one step. */
  fastPath(
    id: string,
    subcontractorIds: readonly string[],
    rationale: string,
    version: string,
  ): Observable<SourcingDetail> {
    return this.http.post<SourcingDetail>(`${this.url(id)}/fast-path`, {
      subcontractorIds,
      rationale,
      version,
    });
  }

  removeCandidate(id: string, candidateId: string, version: string): Observable<SourcingDetail> {
    return this.http.post<SourcingDetail>(`${this.candidate(id, candidateId)}/remove`, { version });
  }

  assess(
    id: string,
    candidateId: string,
    assessment: Assessment,
    version: string,
  ): Observable<SourcingDetail> {
    return this.http.put<SourcingDetail>(`${this.candidate(id, candidateId)}/prequalification`, {
      ...assessment,
      version,
    });
  }

  shortlist(
    id: string,
    candidateId: string,
    shortlisted: boolean,
    version: string,
  ): Observable<SourcingDetail> {
    return this.http.put<SourcingDetail>(`${this.candidate(id, candidateId)}/shortlist`, {
      shortlisted,
      version,
    });
  }

  /** CF-130: the preparer marks the shortlist ready for approval. */
  requestApproval(id: string, version: string): Observable<SourcingDetail> {
    return this.http.post<SourcingDetail>(`${this.url(id)}/request-approval`, { version });
  }

  approve(id: string, version: string): Observable<SourcingDetail> {
    return this.http.post<SourcingDetail>(`${this.url(id)}/approve`, { version });
  }

  reopen(id: string, reason: string, version: string): Observable<SourcingDetail> {
    return this.http.post<SourcingDetail>(`${this.url(id)}/reopen`, { reason, version });
  }

  private url(id: string): string {
    return `/api/v1/sourcing/${encodeURIComponent(id)}`;
  }

  private candidate(id: string, candidateId: string): string {
    return `${this.url(id)}/candidates/${encodeURIComponent(candidateId)}`;
  }
}

/** One resolution order for every sourcing screen: known code, then localized fallback. */
export function sourcingProblemMessage(error: unknown): string {
  return problemMessage(error, { plane: 'tenant', subject: 'record' });
}

/** Someone else changed the sourcing since this screen loaded it. */
export function isStale(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 409 &&
    typeof error.error === 'object' &&
    (error.error?.code === 'concurrency.stale' || error.error?.code === 'concurrency.retry')
  );
}

export interface CriteriaSummary {
  readonly met: number;
  readonly notMet: number;
  readonly notAssessed: number;
}

export function summarizeCriteria(criteria: Criteria): CriteriaSummary {
  const outcomes = CRITERIA.map((key) => criteria[key]);
  return {
    met: outcomes.filter((outcome) => outcome === 'Met').length,
    notMet: outcomes.filter((outcome) => outcome === 'NotMet').length,
    notAssessed: outcomes.filter((outcome) => outcome === 'NotAssessed').length,
  };
}

/**
 * The same rule the server applies, so the form can explain it before sending: not qualifying, or
 * qualifying despite an unmet criterion, needs a rationale.
 */
export function rationaleRequired(result: PrequalificationResult, criteria: Criteria): boolean {
  return (
    result === 'NotQualified' ||
    (result === 'Qualified' && CRITERIA.some((key) => criteria[key] === 'NotMet'))
  );
}

export const NOT_ASSESSED: Criteria = {
  tradeFit: 'NotAssessed',
  geographicCoverage: 'NotAssessed',
  capacity: 'NotAssessed',
  experience: 'NotAssessed',
  compliance: 'NotAssessed',
  risk: 'NotAssessed',
  pastPerformance: 'NotAssessed',
};

export { criterionLabel, criterionOutcomeLabel, prequalificationResultLabel, sourcingStatusLabel };
