import { problemMessage } from '../../core/localization/product-problem';
import { lifecycleStatusLabel } from '../../core/localization/labels';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export const PROJECT_PERMISSIONS = {
  view: 'Projects.View',
  create: 'Projects.Create',
  edit: 'Projects.Edit',
  changeStatus: 'Projects.ChangeStatus',
  packagesView: 'WorkPackages.View',
  packagesCreate: 'WorkPackages.Create',
  packagesEdit: 'WorkPackages.Edit',
  packagesChangeStatus: 'WorkPackages.ChangeStatus',
} as const;

export const PROJECTS_FEATURE = 'projects';

export type ProjectStatus = 'Draft' | 'Active' | 'OnHold' | 'Completed' | 'Cancelled';
export type WorkPackageStatus = ProjectStatus;

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'Draft',
  'Active',
  'OnHold',
  'Completed',
  'Cancelled',
];

/** Explains the commercial consequence before a lifecycle action is confirmed. */
export const PROJECT_STATUS_INTENT: Record<ProjectStatus, string> = {
  Draft: $localize`:@@projectIntent.draft:Return to planning.`,
  Active: $localize`:@@projectIntent.active:Activate this project. It will use one active-project slot from your plan.`,
  OnHold: $localize`:@@projectIntent.onHold:Pause delivery. The project keeps its active-project slot so it can resume.`,
  Completed: $localize`:@@projectIntent.completed:Close this project as delivered. It releases its slot and cannot be reopened.`,
  Cancelled: $localize`:@@projectIntent.cancelled:Cancel this project. It releases its slot and cannot be reopened.`,
};

/**
 * CF-102: each lifecycle move is named by what it does (a verb), never by the state it reaches. CF-019: the dialog's other button says what
 * declining keeps.
 */
export const PROJECT_STATUS_ACTION: Record<ProjectStatus, string> = {
  Draft: $localize`:@@projectAction.draft:Return to planning`,
  Active: $localize`:@@projectAction.active:Activate project`,
  OnHold: $localize`:@@projectAction.onHold:Put project on hold`,
  Completed: $localize`:@@projectAction.completed:Complete project`,
  Cancelled: $localize`:@@projectAction.cancelled:Cancel project`,
};

export const WORK_PACKAGE_STATUS_ACTION: Record<WorkPackageStatus, string> = {
  Draft: $localize`:@@packageAction.draft:Return to draft`,
  Active: $localize`:@@packageAction.active:Activate work package`,
  OnHold: $localize`:@@packageAction.onHold:Put work package on hold`,
  Completed: $localize`:@@packageAction.completed:Complete work package`,
  Cancelled: $localize`:@@packageAction.cancelled:Cancel work package`,
};

/** CF-102: the forward move is the primary action, a pause or closing move secondary, cancelling the danger action. */
export function lifecycleActionClass(next: ProjectStatus): string {
  return next === 'Cancelled'
    ? 'prj-btn prj-btn--danger'
    : next === 'Active'
      ? 'prj-btn'
      : 'prj-btn prj-btn--ghost';
}

export interface ProjectSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly clientName: string | null;
  readonly location: string | null;
  readonly status: ProjectStatus;
  readonly currency: string | null;
  readonly startDate: string | null;
  readonly expectedEndDate: string | null;
  readonly actualEndDate: string | null;
  readonly projectManagerName: string | null;
  readonly procurementOwnerName: string | null;
  readonly workPackageCount: number;
  readonly updatedAtUtc: string;
  readonly version: string;
}

export interface ProjectDetail extends ProjectSummary {
  readonly description: string | null;
  readonly projectManagerAccountId: string | null;
  readonly procurementOwnerAccountId: string | null;
  readonly allowedNextStatuses: readonly ProjectStatus[];
  readonly draftWorkPackageCount: number;
  readonly consumesCapacity: boolean;
  readonly createdAtUtc: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  /** Why the currency can no longer change: amounts already exist in it ("estimates" or "tenders"). */
  readonly currencyLockReason?: 'estimates' | 'tenders' | null;
}

export interface WorkPackageSummary {
  readonly id: string;
  readonly projectId: string;
  readonly code: string;
  readonly title: string;
  readonly category: string | null;
  /** Exact decimal string in the project currency (CF-110): never a floating-point number. */
  readonly estimatedValue: string | null;
  readonly currency: string | null;
  readonly status: WorkPackageStatus;
  readonly plannedStartDate: string | null;
  readonly plannedEndDate: string | null;
  readonly updatedAtUtc: string;
  readonly version: string;
  /** CF-037 (ADR-087): false when the reader may not see the estimate; estimatedValue is then always null. */
  readonly estimateVisible: boolean;
  /** CF-027 (ADR-089): the catalogue trade the category is; null with a category is legacy free text. */
  readonly tradeId: string | null;
  readonly tradeCode: string | null;
}

/** CF-037: one value the estimate has held (append-only). Revision 0 is the value carried over when history began. */
export interface WorkPackageEstimateRevision {
  readonly number: number;
  readonly value: string | null;
  readonly currency: string | null;
  readonly afterPublication: boolean;
  readonly reason: string | null;
  readonly carried: boolean;
  readonly recordedAtUtc: string;
  readonly recordedByName: string;
}

export interface WorkPackageDetail extends WorkPackageSummary {
  readonly projectCode: string;
  readonly projectName: string;
  readonly projectStatus: ProjectStatus;
  readonly description: string | null;
  readonly scopeSummary: string | null;
  readonly allowedNextStatuses: readonly WorkPackageStatus[];
  readonly createdAtUtc: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  /** The reader may enter or change the estimate (commercial roles only). */
  readonly estimateEditable: boolean;
  /** A tender of the package was published: changing the estimate needs a reason. */
  readonly estimateReasonRequired: boolean;
  /** Newest first; empty for readers who may not see the estimate. */
  readonly estimateRevisions: readonly WorkPackageEstimateRevision[];
}

export interface Paged<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
}

export interface AssignableUser {
  readonly accountId: string;
  readonly displayName: string;
  readonly role: string;
}

export interface ProjectListOptions {
  readonly search?: string;
  readonly status?: readonly ProjectStatus[];
  /** CF-036: only the projects this account is the assigned Project Manager of. */
  readonly projectManager?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: 'Code' | 'Name' | 'Status' | 'StartDate' | 'UpdatedAt';
  readonly desc?: boolean;
}

export interface ProjectWrite {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly clientName: string | null;
  readonly location: string | null;
  readonly startDate: string | null;
  readonly expectedEndDate: string | null;
  readonly actualEndDate?: string | null;
  readonly currency: string | null;
  readonly projectManagerAccountId: string | null;
  readonly procurementOwnerAccountId: string | null;
}

export interface WorkPackageWrite {
  readonly code: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly scopeSummary: string | null;
  /** Exact decimal string in the project currency (CF-110): never a floating-point number. */
  readonly estimatedValue: string | null;
  readonly plannedStartDate: string | null;
  readonly plannedEndDate: string | null;
  /** CF-037: why the estimate changes after a tender of the package was published. */
  readonly estimateChangeReason?: string | null;
  /** CF-027 (ADR-089): the catalogue trade. A legacy package may keep its unchanged text in `category` instead. */
  readonly tradeId?: string | null;
}

/** CF-037 (ADR-087): the session permissions that open the estimate field class (the server decides per project). */
export const ESTIMATE_ENTRY_PERMISSION = 'WorkPackages.ViewEstimate';
export const ESTIMATE_REASON_MIN = 3;
export const ESTIMATE_REASON_MAX = 1000;

@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly http = inject(HttpClient);

  listProjects(options: ProjectListOptions = {}): Observable<Paged<ProjectSummary>> {
    let params = new HttpParams();
    if (options.search?.trim()) params = params.set('search', options.search.trim());
    for (const status of options.status ?? []) params = params.append('status', status);
    if (options.projectManager) params = params.set('projectManager', options.projectManager);
    if (options.page) params = params.set('page', options.page);
    if (options.pageSize) params = params.set('pageSize', options.pageSize);
    if (options.sortBy) params = params.set('sortBy', options.sortBy);
    if (options.desc !== undefined) params = params.set('desc', options.desc);
    return this.http.get<Paged<ProjectSummary>>('/api/v1/projects', { params });
  }

  getProject(id: string): Observable<ProjectDetail> {
    return this.http.get<ProjectDetail>(this.projectUrl(id));
  }

  createProject(request: ProjectWrite): Observable<ProjectDetail> {
    return this.http.post<ProjectDetail>('/api/v1/projects', request);
  }

  updateProject(
    id: string,
    request: ProjectWrite & { version: string },
  ): Observable<ProjectDetail> {
    return this.http.put<ProjectDetail>(this.projectUrl(id), request);
  }

  changeProjectStatus(
    id: string,
    status: ProjectStatus,
    version: string,
    actualEndDate: string | null = null,
  ): Observable<ProjectDetail> {
    return this.http.post<ProjectDetail>(`${this.projectUrl(id)}/status`, {
      status,
      actualEndDate,
      version,
    });
  }

  assignableUsers(): Observable<AssignableUser[]> {
    return this.http.get<AssignableUser[]>('/api/v1/projects/assignable-users');
  }

  listWorkPackages(
    projectId: string,
    options: { search?: string; status?: readonly WorkPackageStatus[]; page?: number } = {},
  ): Observable<Paged<WorkPackageSummary>> {
    let params = new HttpParams();
    if (options.search?.trim()) params = params.set('search', options.search.trim());
    for (const status of options.status ?? []) params = params.append('status', status);
    if (options.page) params = params.set('page', options.page);
    return this.http.get<Paged<WorkPackageSummary>>(`${this.projectUrl(projectId)}/work-packages`, {
      params,
    });
  }

  createWorkPackage(projectId: string, request: WorkPackageWrite): Observable<WorkPackageDetail> {
    return this.http.post<WorkPackageDetail>(
      `${this.projectUrl(projectId)}/work-packages`,
      request,
    );
  }

  /** CF-057 (ADR-098): a new Draft package with this one's scope and trades — never its estimate, dates or status. */
  cloneWorkPackage(
    id: string,
    request: { code: string; title: string | null },
  ): Observable<WorkPackageDetail> {
    return this.http.post<WorkPackageDetail>(`${this.packageUrl(id)}/clone`, request);
  }

  getWorkPackage(id: string): Observable<WorkPackageDetail> {
    return this.http.get<WorkPackageDetail>(this.packageUrl(id));
  }

  updateWorkPackage(
    id: string,
    request: WorkPackageWrite & { version: string },
  ): Observable<WorkPackageDetail> {
    return this.http.put<WorkPackageDetail>(this.packageUrl(id), request);
  }

  changeWorkPackageStatus(
    id: string,
    status: WorkPackageStatus,
    version: string,
  ): Observable<WorkPackageDetail> {
    return this.http.post<WorkPackageDetail>(`${this.packageUrl(id)}/status`, { status, version });
  }

  private projectUrl(id: string): string {
    return `/api/v1/projects/${encodeURIComponent(id)}`;
  }

  private packageUrl(id: string): string {
    return `/api/v1/work-packages/${encodeURIComponent(id)}`;
  }
}

/** One resolution order for every Projects screen: known code, then localized fallback. */
export function projectProblemMessage(
  error: unknown,
  subject: 'project' | 'workPackage' = 'project',
): string {
  return problemMessage(error, { plane: 'tenant', subject });
}

export function projectStatusLabel(status: ProjectStatus): string {
  return lifecycleStatusLabel(status);
}
