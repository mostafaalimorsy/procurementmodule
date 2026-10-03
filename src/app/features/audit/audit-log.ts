import { RouterLink } from '@angular/router';
import { auditActionLabel } from './audit-labels';
import { DOCUMENT } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { problemMessage } from '../../core/localization/product-problem';
import { Paged } from '../subcontractors/subcontractors.api';
import {
  AUDIT_AREAS,
  AuditApi,
  AuditArea,
  AuditEntry,
  AuditFacets,
  AuditFilter,
} from './audit.api';

/**
 * The company audit log (Part 12, ADR-080): who did what, when, on which record — filtered and paged on the server, newest first. The
 * details are the short facts the server kept (never free text, amounts, contacts or secrets). The CSV export carries the same filters
 * and is itself recorded in the log.
 */
@Component({
  selector: 'app-audit-log',
  imports: [FormsModule, BusinessDatePipe, RouterLink],
  templateUrl: './audit-log.html',
  styleUrl: './audit-log.scss',
})
export class AuditLogPage implements OnInit {
  /** CF-100 (ADR-160): events read by name, details by words, never snake_case. */
  readonly actionLabel = auditActionLabel;

  detailLabel(key: string): string {
    const words = key.replace(/_/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  private readonly api = inject(AuditApi);
  private readonly document = inject(DOCUMENT);
  readonly areas = AUDIT_AREAS;
  readonly result = signal<Paged<AuditEntry> | null>(null);
  readonly facets = signal<AuditFacets | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly exporting = signal(false);
  readonly exportNotice = signal('');
  area: AuditArea | '' = '';
  action = '';
  actor = '';
  from = '';
  to = '';
  reference = '';
  requestId = '';
  page = 1;
  /** The filters of the list on screen: paging, export and the empty states follow them, not the unapplied form. */
  private applied: AuditFilter = {};

  ngOnInit(): void {
    this.api
      .facets()
      .subscribe({ next: (facets) => this.facets.set(facets), error: () => this.facets.set(null) });
    this.load();
  }

  filter(): AuditFilter {
    return this.applied;
  }

  filtered(): boolean {
    const f = this.applied;
    return !!(
      f.area ||
      f.action ||
      f.actor ||
      f.from ||
      f.to ||
      f.reference?.trim() ||
      f.requestId?.trim()
    );
  }

  apply(): void {
    this.applied = {
      area: this.area,
      action: this.action,
      actor: this.actor,
      from: this.from,
      to: this.to,
      reference: this.reference,
      requestId: this.requestId,
    };
    this.page = 1;
    this.load();
  }

  clear(): void {
    this.reset();
    this.apply();
  }

  /** CF-122 (ADR-148): every entry the same request recorded (and only those: the other filters are cleared). */
  showRequest(requestId: string): void {
    this.reset();
    this.requestId = requestId;
    this.apply();
  }

  private reset(): void {
    this.area = '';
    this.action = '';
    this.actor = '';
    this.from = '';
    this.to = '';
    this.reference = '';
    this.requestId = '';
  }

  goToPage(page: number): void {
    this.page = page;
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list(this.filter(), this.page).subscribe({
      next: (page) => {
        this.result.set(page);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(problemMessage(error, { plane: 'tenant', subject: 'record' }));
        this.loading.set(false);
      },
    });
  }

  exportCsv(): void {
    this.exporting.set(true);
    this.exportNotice.set('');
    this.api.exportCsv(this.filter()).subscribe({
      next: (response) => {
        const rows = Number(response.headers.get('X-Export-Rows') ?? '0');
        const truncated = response.headers.get('X-Export-Truncated') === 'true';
        const url = URL.createObjectURL(response.body!);
        const link = this.document.createElement('a');
        link.href = url;
        link.download = 'audit-log.csv';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.exportNotice.set(
          truncated
            ? $localize`:@@audit.exportTruncated:Exported the newest ${rows}:rows: entries — narrow the filters to export the rest.`
            : $localize`:@@audit.exported:Exported ${rows}:rows: entries.`,
        );
        this.exporting.set(false);
      },
      error: (error: unknown) => {
        this.error.set(problemMessage(error, { plane: 'tenant', subject: 'record' }));
        this.exporting.set(false);
      },
    });
  }

  areaLabel(area: AuditArea | string): string {
    switch (area) {
      case 'Identity':
        return $localize`:@@audit.areaIdentity:Users and roles`;
      case 'Company':
        return $localize`:@@audit.areaCompany:Company settings`;
      case 'Projects':
        return $localize`:@@audit.areaProjects:Projects and work packages`;
      case 'Directory':
        return $localize`:@@audit.areaDirectory:Subcontractor directory`;
      case 'Sourcing':
        return $localize`:@@audit.areaSourcing:Sourcing`;
      case 'Tendering':
        return $localize`:@@audit.areaTendering:Tendering and bids`;
      case 'Evaluation':
        return $localize`:@@audit.areaEvaluation:Evaluation`;
      case 'Decision':
        return $localize`:@@audit.areaDecision:Recommendation, approval and award`;
      case 'Performance':
        return $localize`:@@audit.areaPerformance:Performance closeout`;
      case 'SignIns':
        return $localize`:@@audit.areaSignIns:Sign-ins`;
      default:
        return $localize`:@@audit.areaOther:Other`;
    }
  }

  actorLabel(entry: AuditEntry): string {
    switch (entry.actorKind) {
      case 'User':
        if (entry.actorErased) return $localize`:@@audit.erasedUser:An erased user`;
        return entry.actorName ?? $localize`:@@audit.formerMember:A former member`;
      case 'Bidder':
        return $localize`:@@audit.actorBidder:An invited firm (through its link)`;
      case 'Platform':
        return $localize`:@@audit.actorPlatform:Platform operator`;
      default:
        return $localize`:@@audit.actorSystem:The system`;
    }
  }
}
