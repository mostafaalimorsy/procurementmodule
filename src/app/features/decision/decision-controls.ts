import { ComplianceChips } from '../subcontractors/compliance-chips';
import { Component, computed, inject, input } from '@angular/core';
import { ZonedInstantPipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { money } from '../evaluation/evaluation-format';
import { DecisionWorkspace } from './decision.api';
import { standingLabel, validityBasisLabel, validityStateLabel } from './decision-labels';

/**
 * The governance facts a decision is judged against (ADR-086), as the server judged them now: how many firms were invited,
 * answered and are compliant against the company minimum (CF-038); each bid's directory standing (CF-044) and derived
 * validity (CF-039); and, for readers who may see it, the package estimate with each bid's variance and whether the saved
 * award value is above it beyond the company's tolerance (CF-037), its value at publication and whether it compares at all (red-team
 * B7). Validity dates are shown in the tender's time zone (G050). Shown to preparers and approvers alike; it decides nothing.
 */
@Component({
  selector: 'app-decision-controls',
  imports: [ZonedInstantPipe, ComplianceChips],
  templateUrl: './decision-controls.html',
  styleUrl: './decision-controls.scss',
})
export class DecisionControlsView {
  readonly locale = inject(LocaleService).locale;
  readonly workspace = input.required<DecisionWorkspace>();

  readonly standingLabel = standingLabel;
  readonly validityLabel = validityStateLabel;
  readonly basisLabel = validityBasisLabel;

  readonly controls = computed(() => this.workspace().controls);
  readonly basis = computed(() => this.controls()?.candidates[0]?.validityBasis ?? null);
  /** Red-team B7 (CF-037 AC4): the estimate is in another currency than the bids — shown, never compared or converted. */
  readonly notComparable = computed(() => this.controls()?.estimateComparable === false);

  money(amount: string | null | undefined): string {
    return money(amount, this.locale);
  }

  /** A signed percentage, isolated left-to-right ("+11.11 %"). */
  percent(value: string | null): string {
    if (value === null) return '—';
    return value.startsWith('-') ? `${value} %` : `+${value} %`;
  }
}

/**
 * Whether an amount is above the estimate by more than the tolerance — exact decimal arithmetic on canonical strings (never
 * floating point), mirroring the server: value > estimate × (1 + tolerance / 100).
 */
export function exceedsEstimate(
  value: string,
  estimate: string,
  tolerancePercent: string,
): boolean {
  const scale = 6;
  const toUnits = (amount: string): bigint => {
    const [whole, fraction = ''] = amount.trim().split('.');
    return BigInt(whole + fraction.padEnd(scale, '0').slice(0, scale));
  };
  const hundred = 100n * 10n ** BigInt(scale);
  return toUnits(value) * hundred > toUnits(estimate) * (hundred + toUnits(tolerancePercent));
}
