import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import {
  COMPLIANCE_PERMISSIONS,
  ComplianceApi,
  ComplianceDocument,
  ComplianceRecordInput,
  SubcontractorCompliance,
  VENDOR_STATUSES,
  VendorApprovalStatus,
  complianceStateLabel,
  vendorStatusLabel,
} from './compliance.api';
import { directoryProblemMessage } from './subcontractors.api';

/**
 * CF-056 (ADR-095): a firm's compliance file — the documents its trades require and their state today, the append-only history (a renewal
 * supersedes, a withdrawal is recorded), files served only once the malware scanner found them clean (CF-070), and the approved-vendor
 * status per trade. A Blocked firm stays blocked whatever its AVL status.
 */
@Component({
  selector: 'app-subcontractor-compliance',
  imports: [FormsModule, BusinessDatePipe],
  templateUrl: './subcontractor-compliance.html',
})
export class SubcontractorComplianceView implements OnInit {
  private readonly api = inject(ComplianceApi);
  private readonly session = inject(SessionService);

  readonly subcontractorId = input.required<string>();

  readonly stateLabel = complianceStateLabel;
  readonly vendorLabel = vendorStatusLabel;
  readonly statuses = VENDOR_STATUSES;
  readonly file = signal<SubcontractorCompliance | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly canRecord = computed(() => this.session.hasPermission(COMPLIANCE_PERMISSIONS.record));
  readonly canSetVendor = computed(() =>
    this.session.hasPermission(COMPLIANCE_PERMISSIONS.setVendorStatus),
  );
  readonly activeTypes = computed(() =>
    (this.file()?.requirements ?? []).filter((item) => item.type.isActive).map((item) => item.type),
  );
  readonly selectedType = computed(() => {
    this.revision();
    return this.activeTypes().find((type) => type.id === this.form.typeId) ?? null;
  });

  form: ComplianceRecordInput = this.emptyForm();
  attachment: File | null = null;
  vendorStatus: Record<string, VendorApprovalStatus | ''> = {};
  vendorReason: Record<string, string> = {};
  private readonly revision = signal(0);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.compliance(this.subcontractorId()).subscribe({
      next: (file) => this.take(file),
      error: (error: unknown) => this.error.set(directoryProblemMessage(error)),
    });
  }

  edited(): void {
    this.revision.update((value) => value + 1);
  }

  choose(event: Event): void {
    const element = event.target as HTMLInputElement;
    this.attachment = element.files?.[0] ?? null;
  }

  record(): void {
    if (this.busy() || !this.form.typeId) return;
    this.busy.set(true);
    this.error.set('');
    this.api.record(this.subcontractorId(), this.form, this.attachment).subscribe({
      next: (file) => {
        this.busy.set(false);
        this.form = this.emptyForm();
        this.attachment = null;
        this.take(file);
        this.notice.set(
          $localize`:@@compliance.recorded:Document recorded. Earlier records stay in the history.`,
        );
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  withdraw(document: ComplianceDocument): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.withdraw(this.subcontractorId(), document.id, null).subscribe({
      next: (file) => {
        this.busy.set(false);
        this.take(file);
        this.notice.set(
          $localize`:@@compliance.withdrawn:Document withdrawn. The record stays in the history.`,
        );
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  setVendor(tradeId: string): void {
    const status = this.vendorStatus[tradeId];
    if (this.busy() || !status) return;
    this.busy.set(true);
    this.api
      .setVendorStatus(this.subcontractorId(), tradeId, status, this.vendorReason[tradeId] ?? '')
      .subscribe({
        next: (file) => {
          this.busy.set(false);
          this.take(file);
          this.notice.set($localize`:@@compliance.vendorSaved:Approved-vendor status saved.`);
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  fileUrl(document: ComplianceDocument): string {
    return this.api.fileUrl(this.subcontractorId(), document.id);
  }

  private take(file: SubcontractorCompliance): void {
    this.file.set(file);
    this.error.set('');
    for (const vendor of file.vendor) {
      this.vendorStatus[vendor.tradeId] = '';
      this.vendorReason[vendor.tradeId] = '';
    }
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.error.set(directoryProblemMessage(error));
  }

  private emptyForm(): ComplianceRecordInput {
    return { typeId: '', number: '', issuer: '', issuedOn: '', expiresOn: '', note: '' };
  }
}
