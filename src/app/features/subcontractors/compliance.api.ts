import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { TradeRef } from './subcontractors.api';

/** CF-056 (ADR-095): compliance permissions. */
export const COMPLIANCE_PERMISSIONS = {
  manageTypes: 'Compliance.ManageTypes',
  record: 'Compliance.Record',
  setVendorStatus: 'Compliance.SetVendorStatus',
} as const;

export type ComplianceState = 'Valid' | 'ExpiringSoon' | 'Expired' | 'Missing';
export type VendorApprovalStatus = 'Approved' | 'Preferred' | 'Watchlist' | 'NotApproved';
export const VENDOR_STATUSES: readonly VendorApprovalStatus[] = [
  'Approved',
  'Preferred',
  'Watchlist',
  'NotApproved',
];
export type FileScanState = 'Pending' | 'Clean' | 'Infected';

export interface ComplianceType {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly requiresNumber: boolean;
  readonly requiresIssuer: boolean;
  readonly requiresExpiry: boolean;
  readonly awardBlocking: boolean;
  readonly appliesToAllTrades: boolean;
  readonly trades: readonly TradeRef[];
  readonly presetKey: string | null;
  readonly isActive: boolean;
  readonly version: string;
}

export interface ComplianceTypeInput {
  name: string;
  description: string | null;
  requiresNumber: boolean;
  requiresIssuer: boolean;
  requiresExpiry: boolean;
  awardBlocking: boolean;
  appliesToAllTrades: boolean;
  tradeIds: string[];
  isActive: boolean;
}

export interface CompliancePreset {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly requiresNumber: boolean;
  readonly requiresIssuer: boolean;
  readonly requiresExpiry: boolean;
  readonly added: boolean;
}

export interface ComplianceDocument {
  readonly id: string;
  readonly typeId: string;
  readonly typeName: string;
  readonly number: string | null;
  readonly issuer: string | null;
  readonly issuedOn: string | null;
  readonly expiresOn: string | null;
  readonly note: string | null;
  readonly isWithdrawal: boolean;
  readonly state: ComplianceState;
  readonly fileName: string | null;
  readonly sizeBytes: number | null;
  readonly fileScanState: FileScanState | null;
  readonly recordedAtUtc: string;
  readonly recordedByName: string;
  readonly supersedesId: string | null;
}

export interface ComplianceRequirement {
  readonly type: ComplianceType;
  readonly required: boolean;
  readonly state: ComplianceState;
  readonly current: ComplianceDocument | null;
}

export interface VendorApproval {
  readonly tradeId: string;
  readonly tradeCode: string;
  readonly tradeName: string;
  readonly status: VendorApprovalStatus | null;
  readonly reason: string | null;
  readonly setAtUtc: string | null;
  readonly setByName: string | null;
}

export interface SubcontractorCompliance {
  readonly subcontractorId: string;
  readonly asOf: string;
  readonly requirements: readonly ComplianceRequirement[];
  readonly history: readonly ComplianceDocument[];
  readonly vendor: readonly VendorApproval[];
  readonly vendorHistory: readonly {
    readonly tradeId: string;
    readonly status: VendorApprovalStatus;
    readonly reason: string;
    readonly setAtUtc: string;
    readonly setByName: string;
  }[];
  readonly blocked: boolean;
}

/** A required document as other screens show it (sourcing candidates, decision controls, shortlist snapshots). */
export interface ComplianceItem {
  readonly typeId: string;
  readonly typeName: string;
  readonly state: ComplianceState;
  readonly expiresOn: string | null;
  readonly awardBlocking: boolean;
}

export interface ComplianceRecordInput {
  typeId: string;
  number: string;
  issuer: string;
  issuedOn: string;
  expiresOn: string;
  note: string;
}

@Injectable({ providedIn: 'root' })
export class ComplianceApi {
  private readonly http = inject(HttpClient);

  types(): Observable<ComplianceType[]> {
    return this.http.get<ComplianceType[]>('/api/v1/compliance-types');
  }

  presets(): Observable<CompliancePreset[]> {
    return this.http.get<CompliancePreset[]>('/api/v1/compliance-types/presets');
  }

  addPreset(key: string): Observable<ComplianceType> {
    return this.http.post<ComplianceType>('/api/v1/compliance-types/presets', { key });
  }

  createType(input: ComplianceTypeInput): Observable<ComplianceType> {
    return this.http.post<ComplianceType>('/api/v1/compliance-types', input);
  }

  updateType(id: string, input: ComplianceTypeInput, version: string): Observable<ComplianceType> {
    return this.http.put<ComplianceType>(`/api/v1/compliance-types/${id}`, { ...input, version });
  }

  compliance(subcontractorId: string): Observable<SubcontractorCompliance> {
    return this.http.get<SubcontractorCompliance>(
      `/api/v1/subcontractors/${subcontractorId}/compliance`,
    );
  }

  record(
    subcontractorId: string,
    input: ComplianceRecordInput,
    file: File | null,
  ): Observable<SubcontractorCompliance> {
    const form = new FormData();
    form.append('typeId', input.typeId);
    for (const field of ['number', 'issuer', 'issuedOn', 'expiresOn', 'note'] as const)
      if (input[field].trim()) form.append(field, input[field].trim());
    if (file) form.append('file', file, file.name);
    return this.http.post<SubcontractorCompliance>(
      `/api/v1/subcontractors/${subcontractorId}/compliance/documents`,
      form,
    );
  }

  withdraw(
    subcontractorId: string,
    documentId: string,
    note: string | null,
  ): Observable<SubcontractorCompliance> {
    return this.http.post<SubcontractorCompliance>(
      `/api/v1/subcontractors/${subcontractorId}/compliance/documents/${documentId}/withdraw`,
      { note },
    );
  }

  fileUrl(subcontractorId: string, documentId: string): string {
    return `/api/v1/subcontractors/${subcontractorId}/compliance/documents/${documentId}/file`;
  }

  setVendorStatus(
    subcontractorId: string,
    tradeId: string,
    status: VendorApprovalStatus,
    reason: string,
  ): Observable<SubcontractorCompliance> {
    return this.http.post<SubcontractorCompliance>(
      `/api/v1/subcontractors/${subcontractorId}/compliance/vendor-status`,
      {
        tradeId,
        status,
        reason,
      },
    );
  }
}

export function complianceStateLabel(state: ComplianceState): string {
  switch (state) {
    case 'Valid':
      return $localize`:@@complianceState.valid:Valid`;
    case 'ExpiringSoon':
      return $localize`:@@complianceState.expiringSoon:Expiring soon`;
    case 'Expired':
      return $localize`:@@complianceState.expired:Expired`;
    default:
      return $localize`:@@complianceState.missing:Missing`;
  }
}

export function vendorStatusLabel(status: VendorApprovalStatus | null): string {
  switch (status) {
    case 'Approved':
      return $localize`:@@vendorStatus.approved:Approved`;
    case 'Preferred':
      return $localize`:@@vendorStatus.preferred:Preferred`;
    case 'Watchlist':
      return $localize`:@@vendorStatus.watchlist:Watchlist`;
    case 'NotApproved':
      return $localize`:@@vendorStatus.notApproved:Not approved`;
    default:
      return $localize`:@@vendorStatus.none:No AVL status`;
  }
}

/** The items that need attention, most serious first (award-blocking gaps, then other gaps, then expiring). */
export function complianceAttention(
  items: readonly ComplianceItem[] | null | undefined,
): readonly ComplianceItem[] {
  const rank = (item: ComplianceItem) =>
    (item.awardBlocking && (item.state === 'Expired' || item.state === 'Missing') ? 0 : 2) +
    (item.state === 'ExpiringSoon' ? 1 : 0);
  return [...(items ?? [])]
    .filter((item) => item.state !== 'Valid')
    .sort((a, b) => rank(a) - rank(b));
}
