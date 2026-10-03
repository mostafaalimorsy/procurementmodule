import { HttpClient } from '@angular/common/http';
import { problemMessage as resolveProblem } from '../../core/localization/product-problem';
import { IdentityMailState } from '../../core/localization/labels';
import { Injectable, inject } from '@angular/core';

export interface AccessPolicy {
  emailDomains: string[];
  ipRules: string[];
  locationRules: { country: string; region?: string | null }[];
}

/** ADR-176: which optional rules this deployment can evaluate; a rule it cannot evaluate would deny every user, so it is not saved. */
export interface AccessPolicyCapabilities {
  /** The API sees the client's own address (not behind the web proxy). */
  clientAddress: boolean;
  /** The client address is known and an IP-location service is configured. */
  location: boolean;
}

export interface PackageTerms {
  displayName: string;
  description: string;
  features: string[];
  limits: Record<string, number>;
  /** CF-060 (ADR-137): the workflow end the operator acknowledges ("evaluation" or "award"), when the plan stops there. */
  acknowledgedWorkflowEnd?: string | null;
}

export interface PackageRevision extends PackageTerms {
  id: string;
  number: number;
  createdAtUtc: string;
  /** Companies currently pinned to this revision. */
  assignedCompanies?: number;
  /** CF-060 (ADR-137): the acknowledged workflow end, and why the revision cannot be newly assigned. */
  workflowEndsAt?: string | null;
  workflowIssue?: 'unopenable' | 'end_unacknowledged' | null;
}

export interface PlatformPackage {
  id: string;
  code: string;
  isActive: boolean;
  revisions: PackageRevision[];
}

/** Server-published description of what this build can sell. The console renders controls from it. */
export interface FeatureCatalogueEntry {
  readonly key: string;
  readonly available: boolean;
  /** Features that must be included whenever this one is (ADR-040). Absent means none. */
  readonly requiresFeatures?: readonly string[];
}

export interface LimitCatalogueEntry {
  readonly key: string;
  readonly measured: boolean;
  readonly minimum: number;
  readonly requiredWithFeature: string | null;
  readonly requiredForAssignment: boolean;
}

export interface EntitlementCatalogue {
  readonly features: readonly FeatureCatalogueEntry[];
  readonly limits: readonly LimitCatalogueEntry[];
  /** CF-060 (ADR-137): the workflow's stages in order, and the ends no plan may have. */
  readonly workflowStages?: readonly string[];
  readonly refusedWorkflowEnds?: readonly string[];
}

export interface Company {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  packageRevisionId: string;
  accessPolicy: AccessPolicy;
  firstAdminEmail: string;
  firstAdminState: string;
  /** CF-078 (ADR-112): where the latest first-admin invitation email stands (list and detail reads). */
  firstAdminInvitationEmail?: IdentityMailState | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  /** Concurrency token; every mutation echoes it so a stale screen cannot overwrite a newer edit. */
  version: string;
  /** CF-061 (ADR-133): Active · ReadOnlyGrace · Suspended, and while read-only: until when, what then, the plan then. */
  accessState?: CompanyAccessState;
  graceEndsAtUtc?: string | null;
  graceEndState?: CompanyAccessState | null;
  pendingPackageRevisionId?: string | null;
  /** CF-071 (ADR-134): a scheduled deletion (the customer's written request) and when it ran. */
  purgeAfterUtc?: string | null;
  purgeRequestReference?: string | null;
  purgedAtUtc?: string | null;
  /** OD-16 (ADR-135): whether this company's intelligence evidence may ever feed anonymised aggregates. */
  intelligenceReuse?: IntelligenceReusePolicy;
  intelligenceReuseLegalBasis?: string | null;
  intelligenceReuseChangedAtUtc?: string | null;
  /** CF-127 / OD-15 (ADR-138): the commercial footing the operator recorded — shown only, never a control. */
  commercialMode?: CommercialMode | null;
  commercialStartsOn?: string | null;
  commercialEndsOn?: string | null;
  commercialReference?: string | null;
  /** OD-20 (ADR-139): the company's country, its residency policy, and why when that is not the recommended one. */
  countryCode?: string | null;
  residencyPolicyId?: string | null;
  residencyOverrideReason?: string | null;
}

/** CF-071 (ADR-134): the deletion certificate. */
export interface CompanyPurgeCertificate {
  companyId: string;
  code: string;
  purgedAtUtc: string;
  requestReference: string;
  rows: Record<string, number>;
  totalRows: number;
  files: number;
  filesMissing: number;
  rowsByClass?: Record<string, number>;
  intelligenceReuse?: IntelligenceReusePolicy;
}

export type IntelligenceReusePolicy = 'TenantOnly' | 'AnonymizedAggregate';

export type CompanyAccessState = 'Active' | 'ReadOnlyGrace' | 'Suspended' | 'Purged';

/** CF-061 (ADR-133): in-flight work the owning modules count (integers only). */
export interface CompanyInFlight {
  companyId: string;
  counts: Record<string, number>;
  total: number;
}

/** What removing a feature freezes — mirrors the server's InFlightKeys.FrozenBy. */
export function frozenBy(feature: string): readonly string[] {
  switch (feature) {
    case 'tendering':
    case 'bidder_portal':
      return ['open_tenders', 'open_rounds'];
    case 'evaluation':
      return ['open_tenders'];
    case 'award':
      return ['open_rounds', 'decisions_pending_approval', 'decisions_approved_not_awarded'];
    case 'performance':
      return ['closeouts_in_progress'];
    default:
      return [];
  }
}

/** Measured usage against the company's assigned revision; read-only, operator-only. */
export interface QuotaStateView {
  readonly key: string;
  readonly usage: number;
  readonly limit: number | null;
  readonly overLimit: boolean;
  readonly canCreate: boolean;
  readonly measured: boolean;
}

export interface CompanyUsage {
  readonly companyId: string;
  readonly packageRevisionId: string;
  readonly companyIsActive: boolean;
  readonly quotas: readonly QuotaStateView[];
}

/** OD-20 (ADR-139): a data residency policy (data, never code: no country rule is built in). */
export interface ResidencyPolicy {
  id: string;
  code: string;
  name: string;
  region: string;
  recommendedCountries: string[];
  minimumRetentionDays: number;
  allowsOverride: boolean;
  isActive: boolean;
  version: string;
  assignedCompanies: number;
}

export interface ResidencyPolicies {
  deploymentRegion: string | null;
  policies: ResidencyPolicy[];
}

export interface SaveResidencyPolicy {
  code: string;
  name: string;
  region: string;
  recommendedCountries: string[];
  minimumRetentionDays: number;
  allowsOverride: boolean;
  isActive: boolean;
  version?: string;
}

/** CF-079 (ADR-143): a Company Admin recovery — requested by one operator, approved by another. */
export interface AdminRecovery {
  id: string;
  companyId: string;
  email: string;
  displayName: string;
  requestReference: string;
  requestedBy: string;
  requestedByName: string | null;
  requestedAtUtc: string;
  status: 'Pending' | 'Completed' | 'Cancelled';
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAtUtc: string | null;
}

/** CF-066 (ADR-142): a named platform operator. */
export interface PlatformOperator {
  id: string;
  email: string;
  displayName: string;
  status: 'Active' | 'Disabled';
  totpEnrolled: boolean;
  isBootstrap: boolean;
  setupPending: boolean;
  lastSignInAtUtc: string | null;
  createdAtUtc: string;
}

export interface CreatedOperator {
  operator: PlatformOperator;
  setupToken: string;
  expiresAtUtc: string;
}

export interface PlatformAuditEntry {
  id: string;
  atUtc: string;
  actor: string;
  actorName: string | null;
  action: string;
  companyId: string | null;
  companyCode: string | null;
  metadataJson: string;
  /** CF-122 (ADR-148): the request the event was recorded in; null for the product's own changes. */
  request?: {
    requestId: string | null;
    sourceAddress: string | null;
    userAgent: string | null;
  } | null;
}

/** CF-118 (ADR-149): stored secrets against the configured keys (fingerprints and counts only, never a value). */
export interface SecretStoreStatus {
  store: string;
  current: number;
  previous: number;
  unreadable: number;
}

export interface SecretKeyStatus {
  currentKeyId: string | null;
  previousKeyIds: string[];
  keyRingEncrypted: boolean;
  stores: SecretStoreStatus[];
}

export interface SecretRewrapResult {
  rewrapped: number;
  unreadable: number;
  conflicts: number;
  dataProtectionKeyCreated: boolean;
  status: SecretKeyStatus;
}

export interface PlatformAuditPage {
  items: PlatformAuditEntry[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export type CommercialMode = 'Pilot' | 'PaidPilot' | 'Subscribed';

export interface CommercialTerms {
  mode: CommercialMode;
  startsOn: string;
  endsOn: string | null;
  reference: string | null;
}

export interface CreateCompany {
  code: string;
  name: string;
  packageRevisionId: string;
  accessPolicy: AccessPolicy;
  firstAdminEmail: string;
  firstAdminDisplayName: string;
  commercial?: CommercialTerms;
}

@Injectable({ providedIn: 'root' })
export class PlatformApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/platform';
  companies() {
    return this.http.get<Company[]>(`${this.base}/companies`);
  }
  company(id: string) {
    return this.http.get<Company>(`${this.base}/companies/${encodeURIComponent(id)}`);
  }
  companyUsage(id: string) {
    return this.http.get<CompanyUsage>(`${this.base}/companies/${encodeURIComponent(id)}/usage`);
  }
  companiesUsage() {
    return this.http.get<CompanyUsage[]>(`${this.base}/companies/usage`);
  }
  createCompany(body: CreateCompany) {
    return this.http.post<Company>(`${this.base}/companies`, body);
  }
  companyStatus(id: string, isActive: boolean, version: string, confirmInFlight = false) {
    return this.http.put<Company>(`${this.base}/companies/${encodeURIComponent(id)}/status`, {
      isActive,
      version,
      ...(confirmInFlight ? { confirmInFlight } : {}),
    });
  }
  companyInFlight(id: string) {
    return this.http.get<CompanyInFlight>(
      `${this.base}/companies/${encodeURIComponent(id)}/in-flight`,
    );
  }
  startGrace(id: string, days: number, packageRevisionId: string | null, version: string) {
    return this.http.post<Company>(`${this.base}/companies/${encodeURIComponent(id)}/grace`, {
      days,
      packageRevisionId,
      version,
    });
  }
  schedulePurge(id: string, days: number, requestReference: string, version: string) {
    return this.http.post<Company>(
      `${this.base}/companies/${encodeURIComponent(id)}/purge/schedule`,
      {
        days,
        requestReference,
        version,
      },
    );
  }
  adminRecoveries(companyId: string) {
    return this.http.get<AdminRecovery[]>(
      `${this.base}/companies/${encodeURIComponent(companyId)}/admin-recoveries`,
    );
  }
  requestAdminRecovery(
    companyId: string,
    email: string,
    displayName: string,
    requestReference: string,
  ) {
    return this.http.post<AdminRecovery>(
      `${this.base}/companies/${encodeURIComponent(companyId)}/admin-recoveries`,
      {
        email,
        displayName,
        requestReference,
      },
    );
  }
  decideAdminRecovery(companyId: string, recoveryId: string, decision: 'approve' | 'cancel') {
    return this.http.post<AdminRecovery>(
      `${this.base}/companies/${encodeURIComponent(companyId)}/admin-recoveries/${encodeURIComponent(recoveryId)}/${decision}`,
      {},
    );
  }
  operators() {
    return this.http.get<PlatformOperator[]>(`${this.base}/operators`);
  }
  createOperator(email: string, displayName: string) {
    return this.http.post<CreatedOperator>(`${this.base}/operators`, { email, displayName });
  }
  operatorAction(id: string, action: 'disable' | 'enable' | 'reset-totp') {
    return this.http.post<PlatformOperator>(
      `${this.base}/operators/${encodeURIComponent(id)}/${action}`,
      {},
    );
  }
  audit(page: number, action: string, actor: string, requestId = '') {
    const params = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (action.trim()) params.set('action', action.trim());
    if (actor.trim()) params.set('actor', actor.trim());
    if (requestId.trim()) params.set('requestId', requestId.trim());
    return this.http.get<PlatformAuditPage>(`${this.base}/audit?${params.toString()}`);
  }
  secretKeys() {
    return this.http.get<SecretKeyStatus>(`${this.base}/secrets`);
  }
  rewrapSecrets(createDataProtectionKey: boolean) {
    return this.http.post<SecretRewrapResult>(`${this.base}/secrets/rewrap`, {
      createDataProtectionKey,
    });
  }
  residencyPolicies() {
    return this.http.get<ResidencyPolicies>(`${this.base}/residency-policies`);
  }
  createResidencyPolicy(body: SaveResidencyPolicy) {
    return this.http.post<ResidencyPolicy>(`${this.base}/residency-policies`, body);
  }
  reviseResidencyPolicy(id: string, body: SaveResidencyPolicy) {
    return this.http.put<ResidencyPolicy>(
      `${this.base}/residency-policies/${encodeURIComponent(id)}`,
      body,
    );
  }
  setResidency(
    id: string,
    countryCode: string,
    policyId: string,
    overrideReason: string | null,
    version: string,
  ) {
    return this.http.put<Company>(`${this.base}/companies/${encodeURIComponent(id)}/residency`, {
      countryCode,
      policyId,
      overrideReason,
      version,
    });
  }
  setCommercialTerms(id: string, terms: CommercialTerms, version: string) {
    return this.http.put<Company>(`${this.base}/companies/${encodeURIComponent(id)}/commercial`, {
      ...terms,
      version,
    });
  }
  setIntelligenceReuse(
    id: string,
    policy: IntelligenceReusePolicy,
    legalBasis: string | null,
    version: string,
  ) {
    return this.http.put<Company>(
      `${this.base}/companies/${encodeURIComponent(id)}/intelligence-reuse`,
      { policy, legalBasis, version },
    );
  }
  cancelPurge(id: string, version: string) {
    return this.http.post<Company>(
      `${this.base}/companies/${encodeURIComponent(id)}/purge/cancel`,
      {
        version,
      },
    );
  }
  purge(id: string, confirmCode: string, version: string) {
    return this.http.post<CompanyPurgeCertificate>(
      `${this.base}/companies/${encodeURIComponent(id)}/purge`,
      { confirmCode, version },
    );
  }
  endGrace(id: string, version: string) {
    return this.http.post<Company>(`${this.base}/companies/${encodeURIComponent(id)}/grace/end`, {
      version,
    });
  }
  renameCompany(id: string, name: string, version: string) {
    return this.http.put<Company>(`${this.base}/companies/${encodeURIComponent(id)}/profile`, {
      name,
      version,
    });
  }
  assignPackage(id: string, packageRevisionId: string, version: string, confirmInFlight = false) {
    return this.http.put<Company>(`${this.base}/companies/${encodeURIComponent(id)}/package`, {
      packageRevisionId,
      version,
      ...(confirmInFlight ? { confirmInFlight } : {}),
    });
  }
  policy(id: string, body: AccessPolicy, version: string) {
    return this.http.put<Company>(
      `${this.base}/companies/${encodeURIComponent(id)}/access-policy`,
      { ...body, version },
    );
  }
  accessCapabilities() {
    return this.http.get<AccessPolicyCapabilities>(`${this.base}/access-policy/capabilities`);
  }
  resendFirstAdminInvitation(id: string) {
    return this.http.post<void>(
      `${this.base}/companies/${encodeURIComponent(id)}/first-admin/resend-invitation`,
      {},
    );
  }
  catalogue() {
    return this.http.get<EntitlementCatalogue>(`${this.base}/entitlement-catalogue`);
  }
  packages() {
    return this.http.get<PlatformPackage[]>(`${this.base}/packages`);
  }
  createPackage(body: PackageTerms & { code: string }) {
    return this.http.post<PlatformPackage>(`${this.base}/packages`, body);
  }
  revisePackage(id: string, body: PackageTerms) {
    return this.http.post<PlatformPackage>(
      `${this.base}/packages/${encodeURIComponent(id)}/revisions`,
      body,
    );
  }
  packageStatus(id: string, isActive: boolean) {
    return this.http.put<PlatformPackage>(
      `${this.base}/packages/${encodeURIComponent(id)}/status`,
      { isActive },
    );
  }
}

/** Platform screens share the product resolver; only the sign-in wording differs. */
export function problemMessage(error: unknown): string {
  return resolveProblem(error, { plane: 'platform' });
}

export function lines(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** The revision new assignments should use by default: the newest one. */
export function currentRevision(pack: PlatformPackage): PackageRevision {
  return pack.revisions.reduce((latest, revision) =>
    revision.number > latest.number ? revision : latest,
  );
}
