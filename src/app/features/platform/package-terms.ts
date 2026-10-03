import { Component, computed, input } from '@angular/core';
import { featureLabel, quotaLabel } from '../../core/localization/labels';

/** One limit as a commercial phrase: "25 users", "3 active projects", with correct plural forms. */
@Component({
  selector: 'app-quota-amount',
  template: `
    @switch (key()) {
      @case ('max_users') {
        <span i18n="@@terms.users">{value(), plural, =1 {1 user} other {{{ value() }} users}}</span>
      }
      @case ('max_active_projects') {
        <span i18n="@@terms.activeProjects">{value(), plural,
          =1 {1 active project}
          other {{{ value() }} active projects}
        }</span>
      }
      @case ('max_subcontractors') {
        <span i18n="@@terms.subcontractors">{value(), plural,
          =1 {1 subcontractor}
          other {{{ value() }} subcontractors}
        }</span>
      }
      @default {
        <span
          >{{ label() }}: <bdi dir="ltr">{{ value() }}</bdi></span
        >
      }
    }
  `,
})
export class QuotaAmount {
  readonly key = input.required<string>();
  readonly value = input.required<number>();
  protected readonly label = computed(() => quotaLabel(this.key()));
}

/** Human-readable package terms. Never renders a raw key = value dictionary. */
@Component({
  selector: 'app-package-terms',
  imports: [QuotaAmount],
  template: `
    <span class="terms">
      @for (limit of limitEntries(); track limit.key; let last = $last) {
        <app-quota-amount [key]="limit.key" [value]="limit.value" />
        @if (!last) {
          <span aria-hidden="true"> · </span>
        }
      } @empty {
        <span class="muted" i18n="@@terms.noLimits">No capacity defined</span>
      }
    </span>
    @if (features().length) {
      <span class="terms-features">
        @for (feature of features(); track feature) {
          <span class="pill">{{ featureName(feature) }}</span>
        }
      </span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1rem;
    }
    .terms-features {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .pill {
      padding: 0.1rem 0.55rem;
      border: 1px solid var(--color-border);
      border-radius: 999px;
      font-size: 0.8rem;
    }
    .muted {
      color: var(--color-muted);
    }
  `,
})
export class PackageTerms {
  readonly features = input<readonly string[]>([]);
  readonly limits = input<Readonly<Record<string, number>>>({});
  /** Stable, meaningful order: seats first, then capacity the modules own. */
  protected readonly limitEntries = computed(() => {
    const order = ['max_users', 'max_active_projects', 'max_subcontractors'];
    return Object.entries(this.limits())
      .map(([key, value]) => ({ key, value }))
      .sort(
        (a, b) =>
          (order.indexOf(a.key) + 1 || 99) - (order.indexOf(b.key) + 1 || 99) ||
          a.key.localeCompare(b.key),
      );
  });
  protected readonly featureName = featureLabel;
}
