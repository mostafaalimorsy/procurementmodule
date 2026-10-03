import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { highestBand, needsAttention } from '../../core/entitlements/utilization';
import { quotaLabel } from '../../core/localization/labels';
import { BandLabel } from '../../shared/ui/quota-usage';
import { CommercialChip, commercialModeLabel } from './commercial-terms';
import {
  AccessPolicy,
  AccessPolicyCapabilities,
  CommercialMode,
  Company,
  CompanyUsage,
  PlatformApi,
  PlatformPackage,
  problemMessage,
} from './platform-api.service';
import { PolicyFields } from './policy-fields';
import { RevisionPicker } from './revision-picker';

@Component({
  selector: 'app-platform-companies',
  imports: [FormsModule, RouterLink, PolicyFields, RevisionPicker, BandLabel, CommercialChip],
  templateUrl: './companies.html',
  styleUrl: './platform.scss',
})
export class Companies implements OnInit {
  private readonly api = inject(PlatformApi);
  private readonly router = inject(Router);
  readonly companies = signal<Company[]>([]);
  readonly packages = signal<PlatformPackage[]>([]);
  /** Usage by company id; empty when it could not be read, which never blocks the registry. */
  readonly usage = signal<ReadonlyMap<string, CompanyUsage>>(new Map());
  readonly attentionOnly = signal(false);
  protected readonly quotaName = quotaLabel;
  /** Each company's most pressing measured quota, derived once per load. */
  protected readonly summaries = computed(() => {
    const result = new Map<string, ReturnType<typeof highestBand>>();
    for (const [id, usage] of this.usage()) result.set(id, highestBand(usage.quotas));
    return result;
  });
  protected readonly visible = computed(() =>
    this.attentionOnly()
      ? this.companies().filter((company) => needsAttention(this.summaries().get(company.id)?.band))
      : this.companies(),
  );
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  code = '';
  name = '';
  packageRevisionId = '';
  firstAdminDisplayName = '';
  firstAdminEmail = '';
  policy: AccessPolicy = { emailDomains: [], ipRules: [], locationRules: [] };
  /** ADR-176: what this deployment can enforce; null while unknown (the server decides). */
  readonly capabilities = signal<AccessPolicyCapabilities | null>(null);
  readonly enforceable = signal(true);
  commercialMode: CommercialMode | '' = '';
  commercialStartsOn = new Date().toISOString().slice(0, 10);
  commercialEndsOn = '';
  commercialReference = '';
  protected readonly modes: readonly CommercialMode[] = ['Pilot', 'PaidPilot', 'Subscribed'];
  protected readonly modeLabel = commercialModeLabel;
  protected readonly revisionLabel = $localize`:@@companies.revision:Package revision`;

  ngOnInit(): void {
    this.api.accessCapabilities().subscribe({
      next: (value) => this.capabilities.set(value),
      error: () => this.capabilities.set(null),
    });
    forkJoin({
      companies: this.api.companies(),
      packages: this.api.packages(),
      usage: this.api.companiesUsage().pipe(catchError(() => of([] as CompanyUsage[]))),
    }).subscribe({
      next: (value) => {
        this.companies.set(value.companies);
        this.usage.set(new Map(value.usage.map((usage) => [usage.companyId, usage])));
        this.packages.set(value.packages.filter((item) => item.isActive));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(problemMessage(error));
        this.loading.set(false);
      },
    });
  }

  provision(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .createCompany({
        code: this.code,
        name: this.name,
        packageRevisionId: this.packageRevisionId,
        firstAdminDisplayName: this.firstAdminDisplayName.trim(),
        firstAdminEmail: this.firstAdminEmail,
        accessPolicy: this.policy,
        ...(this.commercialMode
          ? {
              commercial: {
                mode: this.commercialMode,
                startsOn: this.commercialStartsOn,
                endsOn: this.commercialEndsOn || null,
                reference: this.commercialReference.trim() || null,
              },
            }
          : {}),
      })
      .subscribe({
        next: (company) => {
          this.busy.set(false);
          void this.router.navigate(['/platform/companies', company.id]);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(problemMessage(error));
        },
      });
  }
}
