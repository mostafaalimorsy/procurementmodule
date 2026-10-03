import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PlatformApi,
  ResidencyPolicies as ResidencyView,
  ResidencyPolicy,
  problemMessage,
} from './platform-api.service';

/** "QA, SA ae" → ["QA", "SA", "AE"]: two-letter country codes the operator lists for a policy. */
export function countryList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
}

/**
 * OD-20 (ADR-139): the operator's data residency policies — which countries each is recommended for, the region that keeps the data,
 * the minimum retention before a deletion and whether an override is permitted. Policies are data: a market is added here, never in code.
 */
@Component({
  selector: 'app-residency-policies',
  imports: [FormsModule],
  styleUrl: './platform.scss',
  template: `
    <p class="eyebrow" i18n="@@companies.eyebrow">Platform control plane</p>
    <h1 i18n="@@residency.title">Residency</h1>
    <p i18n="@@residency.intro">
      Each policy says where a company's data is kept and for how long at least. A company is placed
      under the policy recommended for its country; another one only where the policy permits it,
      with a reason. No country's law is built into the product: policies are what you define here.
    </p>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (view(); as current) {
      <p data-testid="deployment-region">
        <ng-container i18n="@@residency.deployment">This deployment keeps data in</ng-container>
        <bdi dir="ltr" class="ltr-token">{{ current.deploymentRegion ?? '—' }}</bdi>
      </p>
      <section class="panel" aria-labelledby="residency-list-title">
        <h2 id="residency-list-title" i18n="@@residency.policies">Policies</h2>
        <div class="table-scroll">
          <table data-testid="residency-table">
            <thead>
              <tr>
                <th scope="col" i18n="@@residency.colPolicy">Policy</th>
                <th scope="col" i18n="@@residency.colRegion">Region</th>
                <th scope="col" i18n="@@residency.colCountries">Recommended for</th>
                <th scope="col" i18n="@@residency.colRetention">Minimum retention</th>
                <th scope="col" i18n="@@residency.colOverride">Override</th>
                <th scope="col" i18n="@@residency.colCompanies">Companies</th>
                <th scope="col">
                  <span class="visually-hidden" i18n="@@residency.colActions">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              @for (policy of current.policies; track policy.id) {
                <tr>
                  <td>
                    <bdi>{{ policy.name }}</bdi> ·
                    <bdi dir="ltr" class="ltr-token">{{ policy.code }}</bdi>
                    @if (!policy.isActive) {
                      <span class="state-chip state-chip--muted" i18n="@@status.inactive"
                        >Inactive</span
                      >
                    }
                  </td>
                  <td>
                    <bdi dir="ltr">{{ policy.region }}</bdi>
                  </td>
                  <td>
                    <bdi dir="ltr">{{ policy.recommendedCountries.join(', ') || '—' }}</bdi>
                  </td>
                  <td i18n="@@residency.days">
                    {policy.minimumRetentionDays, plural,
                      =1 {1 day}
                      other {{{ policy.minimumRetentionDays }} days}
                    }
                  </td>
                  <td>
                    @if (policy.allowsOverride) {
                      <ng-container i18n="@@residency.overrideAllowed"
                        >Permitted, with a reason</ng-container
                      >
                    } @else {
                      <ng-container i18n="@@residency.overrideForbidden"
                        >Not permitted</ng-container
                      >
                    }
                  </td>
                  <td>{{ policy.assignedCompanies }}</td>
                  <td>
                    <button
                      class="secondary"
                      type="button"
                      (click)="edit(policy)"
                      i18n="@@common.edit"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7" i18n="@@residency.empty">
                    No policy yet. Define one per market.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
    <section class="panel" aria-labelledby="residency-form-title">
      <h2 id="residency-form-title">
        @if (editing()) {
          <ng-container i18n="@@residency.editTitle">Edit policy</ng-container>
        } @else {
          <ng-container i18n="@@residency.createTitle">New policy</ng-container>
        }
      </h2>
      <form (ngSubmit)="save()" #form="ngForm">
        <label
          ><span i18n="@@residency.code">Code</span
          ><input
            name="code"
            dir="ltr"
            required
            maxlength="64"
            [readonly]="!!editing()"
            [(ngModel)]="code"
        /></label>
        <label
          ><span i18n="@@residency.name">Name</span
          ><input name="name" required maxlength="200" [(ngModel)]="name"
        /></label>
        <label
          ><span i18n="@@residency.region">Region that keeps the data</span
          ><input
            name="region"
            dir="ltr"
            required
            maxlength="64"
            [readonly]="!!editing()"
            [(ngModel)]="region"
        /></label>
        <label
          ><span i18n="@@residency.countries">Recommended for (two-letter country codes)</span
          ><input name="countries" dir="ltr" [(ngModel)]="countries" placeholder="QA, SA"
        /></label>
        <label
          ><span i18n="@@residency.retention">Minimum retention before deletion (days)</span
          ><input name="retention" type="number" min="0" max="365" required [(ngModel)]="retention"
        /></label>
        <label class="check"
          ><input name="override" type="checkbox" [(ngModel)]="allowsOverride" /><span
            i18n="@@residency.allowsOverride"
            >A company from these countries may be placed under another policy, with a reason</span
          ></label
        >
        @if (editing()) {
          <label class="check"
            ><input name="active" type="checkbox" [(ngModel)]="isActive" /><span
              i18n="@@residency.active"
              >Active (can be assigned)</span
            ></label
          >
        }
        <div class="actions">
          <button [disabled]="form.invalid || busy()" i18n="@@residency.save">Save policy</button>
          @if (editing()) {
            <button class="secondary" type="button" (click)="reset()" i18n="@@common.cancel">
              Cancel
            </button>
          }
        </div>
      </form>
    </section>
  `,
})
export class ResidencyPolicies implements OnInit {
  private readonly api = inject(PlatformApi);
  readonly view = signal<ResidencyView | null>(null);
  readonly editing = signal<ResidencyPolicy | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  code = '';
  name = '';
  region = '';
  countries = '';
  retention = 30;
  allowsOverride = false;
  isActive = true;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.residencyPolicies().subscribe({
      next: (view) => this.view.set(view),
      error: (error: unknown) => this.error.set(problemMessage(error)),
    });
  }

  edit(policy: ResidencyPolicy): void {
    this.editing.set(policy);
    this.code = policy.code;
    this.name = policy.name;
    this.region = policy.region;
    this.countries = policy.recommendedCountries.join(', ');
    this.retention = policy.minimumRetentionDays;
    this.allowsOverride = policy.allowsOverride;
    this.isActive = policy.isActive;
  }

  reset(): void {
    this.editing.set(null);
    this.code = '';
    this.name = '';
    this.region = this.view()?.deploymentRegion ?? '';
    this.countries = '';
    this.retention = 30;
    this.allowsOverride = false;
    this.isActive = true;
  }

  save(): void {
    if (this.busy()) return;
    const editing = this.editing();
    const body = {
      code: this.code.trim(),
      name: this.name.trim(),
      region: this.region.trim(),
      recommendedCountries: countryList(this.countries),
      minimumRetentionDays: Number(this.retention),
      allowsOverride: this.allowsOverride,
      isActive: this.isActive,
      ...(editing ? { version: editing.version } : {}),
    };
    this.busy.set(true);
    this.error.set('');
    (editing
      ? this.api.reviseResidencyPolicy(editing.id, body)
      : this.api.createResidencyPolicy(body)
    ).subscribe({
      next: () => {
        this.busy.set(false);
        this.reset();
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemMessage(error));
      },
    });
  }
}
