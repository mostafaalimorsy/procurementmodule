import { Component, input } from '@angular/core';
import { signedPercent, variationCauseLabel } from './performance-labels';

/**
 * CF-025 (ADR-125): beside a cost variance, how much of it the recorded variations account for and why — "of which variations +9.00 %
 * (Client change), residual +2.00 %". A reader without cost visibility gets the cause only (the server sends no values). Nothing is shown when
 * no cause was recorded.
 */
@Component({
  selector: 'app-variance-cause',
  template: `
    @if (cause()) {
      <span class="pf-variance-cause">
        @if (share()) {
          <span i18n="@@variance.ofWhich"
            >of which variations <bdi dir="ltr">{{ percent(share()) }}</bdi> ({{
              causeLabel(cause())
            }})</span
          >
          @if (residual()) {
            ·
            <span i18n="@@variance.residual"
              >residual <bdi dir="ltr">{{ percent(residual()) }}</bdi></span
            >
          }
        } @else {
          <span i18n="@@variance.causeOnly">variations: {{ causeLabel(cause()) }}</span>
        }
      </span>
    }
  `,
})
export class VarianceCause {
  readonly cause = input<string | null | undefined>(null);
  readonly share = input<string | null | undefined>(null);
  readonly residual = input<string | null | undefined>(null);
  protected readonly percent = signedPercent;
  protected readonly causeLabel = variationCauseLabel;
}
