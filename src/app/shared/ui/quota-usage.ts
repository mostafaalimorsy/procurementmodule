import { Component, computed, input } from '@angular/core';
import {
  QuotaReading,
  UtilizationBand,
  utilizationBand,
  utilizationPercent,
} from '../../core/entitlements/utilization';
import { quotaLabel } from '../../core/localization/labels';

/** The band as words. Colour reinforces it; it never carries the meaning alone. */
@Component({
  selector: 'app-band-label',
  template: `
    @switch (band()) {
      @case ('normal') {
        <ng-container i18n="@@band.normal">Normal</ng-container>
      }
      @case ('approaching') {
        <ng-container i18n="@@band.approaching">Approaching limit</ng-container>
      }
      @case ('atLimit') {
        <ng-container i18n="@@band.at">At limit</ng-container>
      }
      @case ('overLimit') {
        <ng-container i18n="@@band.over">Over limit</ng-container>
      }
      @case ('notIncluded') {
        <ng-container i18n="@@quota.notIncluded">Not included</ng-container>
      }
      @default {
        <ng-container i18n="@@quota.notTracked">Not yet tracked</ng-container>
      }
    }
  `,
})
export class BandLabel {
  readonly band = input.required<UtilizationBand>();
}

/** One quota: name, used / limit, share of the limit, and its band. */
@Component({
  selector: 'app-quota-usage',
  imports: [BandLabel],
  template: `
    <div class="quota-usage" [attr.data-band]="band()">
      <span class="quota-name">{{ name() }}</span>
      <span class="quota-figures">
        @if (quota().measured) {
          @if (quota().limit !== null) {
            <bdi dir="ltr">{{ quota().usage }} / {{ quota().limit }}</bdi>
            @if (percent() !== null) {
              &ngsp;<span class="quota-percent"
                ><bdi dir="ltr">{{ percent() }}%</bdi></span
              >
            }
          } @else {
            <ng-container i18n="@@quota.usedOnly"
              ><bdi dir="ltr">{{ quota().usage }}</bdi> used</ng-container
            >
          }
        } @else if (quota().limit !== null) {
          <ng-container i18n="@@quota.limitOnly"
            >Limit <bdi dir="ltr">{{ quota().limit }}</bdi></ng-container
          >
        }
      </span>
      @if (percent() !== null) {
        <span class="meter" aria-hidden="true"
          ><span class="meter-fill" [style.inline-size.%]="fill()"></span
        ></span>
      }
      <span class="band-chip"><app-band-label [band]="band()" /></span>
    </div>
  `,
  styles: `
    .quota-usage {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.35rem 1rem;
      align-items: center;
      padding-block: 0.8rem;
      border-block-start: 1px solid var(--color-border);
    }
    .quota-name {
      font-size: 0.85rem;
      color: var(--color-muted);
    }
    .quota-figures {
      font-size: 1.15rem;
      font-weight: 600;
      text-align: end;
    }
    .quota-percent {
      margin-inline-start: 0.5rem;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--color-muted);
    }
    .meter {
      grid-column: 1 / -1;
      block-size: 0.4rem;
      overflow: hidden;
      border-radius: 999px;
      background: var(--color-border);
    }
    .meter-fill {
      display: block;
      block-size: 100%;
      background: var(--band-color, var(--color-accent));
    }
    .band-chip {
      grid-column: 1 / -1;
      justify-self: start;
      padding: 0.1rem 0.55rem;
      border: 1px solid var(--band-color, var(--color-border));
      border-radius: 999px;
      color: var(--band-color, var(--color-muted));
      font-size: 0.78rem;
      font-weight: 600;
    }
    [data-band='normal'] {
      --band-color: var(--color-accent);
    }
    [data-band='approaching'] {
      --band-color: var(--color-caution);
    }
    [data-band='atLimit'] {
      --band-color: var(--color-warning);
    }
    [data-band='overLimit'] {
      --band-color: var(--color-danger);
    }
  `,
})
export class QuotaUsage {
  readonly quota = input.required<QuotaReading>();
  protected readonly name = computed(() => quotaLabel(this.quota().key));
  protected readonly band = computed(() => utilizationBand(this.quota()));
  protected readonly percent = computed(() => utilizationPercent(this.quota()));
  protected readonly fill = computed(() => Math.min(this.percent() ?? 0, 100));
}
