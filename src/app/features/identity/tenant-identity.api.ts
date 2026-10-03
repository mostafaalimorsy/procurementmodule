import { problemMessage } from '../../core/localization/product-problem';
import {
  IdentityMailState,
  featureLabel,
  quotaLabel,
  userStatusLabelFor,
} from '../../core/localization/labels';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import {
  PREDEFINED_TENANT_ROLES,
  PredefinedTenantRole,
  tenantRoleLabel,
} from '../../core/auth/tenant-role-labels';

export const TENANT_PERMISSIONS = {
  usersView: 'Users.View',
  usersInvite: 'Users.Invite',
  usersChangeRole: 'Users.ChangeRole',
  usersSuspend: 'Users.Suspend',
  usersResetPassword: 'Users.ResetPassword',
  /** CF-071 (ADR-134): the company's data lifecycle — the complete export and erasure on request (Company Admin). */
  companyManageData: 'Company.ManageData',
} as const;

/** CF-071 (ADR-134): the company's complete export (a ZIP the browser downloads). */
export const COMPANY_EXPORT_URL = '/api/v1/admin/company-export';

export const PREDEFINED_ROLES = PREDEFINED_TENANT_ROLES;

export type PredefinedRole = PredefinedTenantRole;
export type TenantUserStatus = 'Invited' | 'Active' | 'Suspended';

export interface TenantUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: PredefinedRole;
  /** CF-035: roles held besides the primary one (permissions are the union; at most two, never Company Admin). */
  readonly additionalRoles: readonly PredefinedRole[];
  readonly status: TenantUserStatus;
  readonly passwordResetRequired: boolean;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
  /** CF-078 (ADR-112): for an invited account, where its latest invitation email stands. */
  readonly invitationEmail?: IdentityMailState | null;
  /** CF-114 (ADR-157): until when the latest invitation link opens (UTC instant); null when no link is usable. */
  readonly invitationExpiresAtUtc?: string | null;
  /** CF-065 (ADR-145): whether the user has set up an authenticator. */
  readonly mfaEnrolled?: boolean;
}

/** CF-065 (ADR-145): the roles that sign in with an authenticator (the Company Admin always does). */
/** Red-team B-115-2: the email domains and the named addresses a company may invite and sign in with. */
export interface CompanyAllowList {
  readonly domains: readonly string[];
  readonly addresses: readonly string[];
}

export interface CompanySecurity {
  readonly mfaRequiredRoles: readonly PredefinedRole[];
  readonly alwaysRequired: readonly PredefinedRole[];
  readonly isDefault: boolean;
  readonly version: string | null;
  /** CF-068 (ADR-146): a session with no activity for this many minutes ends (15–480). */
  readonly idleTimeoutMinutes?: number;
}

export interface QuotaState {
  readonly key: string;
  readonly usage: number;
  readonly limit: number | null;
  readonly overLimit: boolean;
  readonly canCreate: boolean;
  readonly measured: boolean;
}

export interface CompanyPlan {
  readonly packageCode: string;
  readonly packageDisplayName: string;
  readonly revisionNumber: number;
  readonly packageRevisionId: string;
  readonly companyIsActive: boolean;
  readonly features: readonly string[];
  readonly quotas: readonly QuotaState[];
  /** CF-105: the platform's capabilities this plan does not include. */
  readonly notIncluded?: readonly string[];
}

export interface InviteTenantUser {
  readonly email: string;
  readonly displayName: string;
  readonly role: PredefinedRole;
}

@Injectable({ providedIn: 'root' })
export class TenantIdentityApi {
  private readonly http = inject(HttpClient);

  listUsers(): Observable<TenantUser[]> {
    return this.http.get<TenantUser[]>('/api/v1/admin/users');
  }

  inviteUser(request: InviteTenantUser): Observable<TenantUser> {
    return this.http.post<TenantUser>('/api/v1/admin/users/invite', request);
  }

  changeRole(
    userId: string,
    role: PredefinedRole,
    additionalRoles?: readonly PredefinedRole[],
  ): Observable<TenantUser> {
    return this.http.put<TenantUser>(`${this.userUrl(userId)}/role`, { role, additionalRoles });
  }

  changeStatus(userId: string, status: Extract<TenantUserStatus, 'Active' | 'Suspended'>) {
    return this.http.put<TenantUser>(`${this.userUrl(userId)}/status`, { status });
  }

  /** Cancels a pending invitation, freeing its seat and releasing the address. */
  revokeInvitation(userId: string): Observable<void> {
    return this.http.delete<void>(this.userUrl(userId));
  }

  resendInvitation(userId: string): Observable<void> {
    return this.http.post<void>(`${this.userUrl(userId)}/resend-invitation`, {});
  }

  resetMfa(userId: string): Observable<void> {
    return this.http.post<void>(`${this.userUrl(userId)}/mfa/reset`, {});
  }

  /** Red-team B-115-2 (CF-115 AC6): the company's allow-list, read only (the platform operator changes it). */
  allowList(): Observable<CompanyAllowList> {
    return this.http.get<CompanyAllowList>('/api/v1/admin/access-policy');
  }

  security(): Observable<CompanySecurity> {
    return this.http.get<CompanySecurity>('/api/v1/company/security');
  }

  setSecurity(
    roles: readonly PredefinedRole[],
    version: string | null,
    idleTimeoutMinutes: number,
  ): Observable<CompanySecurity> {
    return this.http.put<CompanySecurity>('/api/v1/company/security', {
      mfaRequiredRoles: roles,
      version,
      idleTimeoutMinutes,
    });
  }

  forcePasswordReset(userId: string): Observable<void> {
    return this.http.post<void>(`${this.userUrl(userId)}/force-password-reset`, {});
  }

  /** CF-071 (ADR-134): pseudonymises a suspended former member (and the person behind their audit events). */
  erase(userId: string): Observable<void> {
    return this.http.post<void>(`${this.userUrl(userId)}/erase`, {});
  }

  /** Read-only. Package, revision, limits and features are Platform Operator territory. */
  companyPlan(): Observable<CompanyPlan> {
    return this.http.get<CompanyPlan>('/api/v1/company/plan');
  }

  acceptInvitation(token: string, password: string): Observable<void> {
    return this.withCsrf(() =>
      this.http.post<void>('/api/v1/invitations/accept', { token, password }),
    );
  }

  forgotPassword(email: string): Observable<void> {
    return this.withCsrf(() => this.http.post<void>('/api/v1/auth/forgot-password', { email }));
  }

  resetPassword(token: string, password: string): Observable<void> {
    return this.withCsrf(() =>
      this.http.post<void>('/api/v1/auth/reset-password', { token, password }),
    );
  }

  private withCsrf<T>(request: () => Observable<T>): Observable<T> {
    return this.http.get<void>('/api/v1/auth/csrf').pipe(switchMap(request));
  }

  private userUrl(userId: string): string {
    return `/api/v1/admin/users/${encodeURIComponent(userId)}`;
  }
}

/** Reads a one-time token from the URL fragment and immediately removes it from browser history. */
export function takeTokenFromFragment(): string {
  if (typeof window === 'undefined') return '';
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
  if (window.location.hash) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
  return token;
}

export function tenantProblemMessage(error: unknown): string {
  return problemMessage(error, { plane: 'tenant' });
}

export function userStatusLabel(user: TenantUser): string {
  return userStatusLabelFor(user.status, user.passwordResetRequired);
}

export { featureLabel, quotaLabel };

export function roleLabel(role: string): string {
  return tenantRoleLabel(role);
}
