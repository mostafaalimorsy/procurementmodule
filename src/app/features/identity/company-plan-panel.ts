import { Component, input } from '@angular/core';
import { QuotaUsage } from '../../shared/ui/quota-usage';
import { CompanyPlan, featureLabel } from './tenant-identity.api';

/**
 * Read-only view of the company's purchased plan and measured usage.
 * Package, revision, limits and features are Platform Operator territory: this component renders
 * them and deliberately offers no way to change them.
 */
@Component({
  selector: 'app-company-plan-panel',
  imports: [QuotaUsage],
  template: `
    @if (plan(); as companyPlan) {
      <section class="plan-panel" aria-labelledby="plan-title">
        <div class="plan-heading">
          <div>
            <p class="section-index" aria-hidden="true">
              <bdi dir="ltr">03</bdi> / <span i18n="@@plan.index">PLAN</span>
            </p>
            <h2 id="plan-title" i18n="@@plan.title">Current plan</h2>
            <p i18n="@@plan.intro">
              Your workspace package and usage. Package terms are managed by the platform operator
              and cannot be changed here.
            </p>
          </div>
          <div class="plan-identity">
            <strong
              ><bdi>{{ companyPlan.packageDisplayName }}</bdi></strong
            >
            <span class="muted"
              ><bdi dir="ltr">{{ companyPlan.packageCode }}</bdi> ·
              <ng-container i18n="@@plan.revision"
                >revision <bdi dir="ltr">{{ companyPlan.revisionNumber }}</bdi></ng-container
              ></span
            >
          </div>
        </div>

        <div class="plan-quotas">
          @for (quota of companyPlan.quotas; track quota.key) {
            <app-quota-usage [quota]="quota" />
          }
        </div>

        @if (companyPlan.features.length) {
          <p class="plan-features">
            <span class="muted" i18n="@@plan.included">Included:</span>
            @for (feature of companyPlan.features; track feature) {
              <span class="pill">{{ featureLabel(feature) }}</span>
            }
          </p>
        } @else {
          <p class="plan-features muted" i18n="@@plan.noFeatures">
            No optional capabilities are included in this package yet.
          </p>
        }
        @if (companyPlan.notIncluded?.length) {
          <p class="plan-features" data-testid="plan-not-included">
            <span class="muted" i18n="@@plan.notIncluded">Not included:</span>
            @for (feature of companyPlan.notIncluded; track feature) {
              <span class="pill pill--muted">{{ featureLabel(feature) }}</span>
            }
          </p>
          <p class="muted" i18n="@@plan.notIncludedHelp">
            To add a capability, ask your platform provider or account manager.
          </p>
        }
      </section>
    }
  `,
  styles: `
    .plan-panel {
      margin-block-start: 3rem;
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      padding: clamp(1rem, 3vw, 1.6rem);
    }
    .section-index {
      color: var(--color-accent);
      letter-spacing: 0.13em;
      font-size: 0.72rem;
      font-weight: 700;
      margin: 0 0 0.6rem;
    }
    h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 650;
    }
    .muted {
      color: var(--color-muted);
    }
    .plan-heading {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      justify-content: space-between;
      align-items: flex-start;
    }
    .plan-identity {
      display: grid;
      gap: 0.2rem;
      text-align: end;
    }
    .plan-quotas {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: 0 1.5rem;
      margin-block: 1.6rem 0;
    }
    dd,
    .plan-features {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .plan-features {
      margin-block-start: 1.4rem;
    }
    .pill {
      padding: 0.15rem 0.5rem;
      border: 1px solid var(--color-border);
      font-size: 0.75rem;
    }
    .pill--muted {
      border-style: dashed;
      color: var(--color-muted);
    }
  `,
})
export class CompanyPlanPanel {
  readonly plan = input<CompanyPlan | null>(null);
  protected readonly featureLabel = featureLabel;
}
