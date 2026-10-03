import { Component, computed, input } from '@angular/core';
import { ComplianceItem, complianceAttention, complianceStateLabel } from './compliance.api';

/**
 * CF-056 (ADR-095): a firm's required compliance documents in one line — what needs attention (award-blocking gaps first), or that every
 * required document is valid. Nothing when the company requires none.
 */
@Component({
  selector: 'app-compliance-chips',
  template: `
    @if ((items() ?? []).length) {
      @if (attention().length) {
        @for (item of attention(); track item.typeId) {
          <span
            class="prj-chip prj-chip--{{ item.state }}"
            [class.prj-chip--Blocked]="
              item.awardBlocking && (item.state === 'Expired' || item.state === 'Missing')
            "
            ><bdi>{{ item.typeName }}</bdi
            >: {{ label(item.state) }}
            @if (item.awardBlocking && (item.state === 'Expired' || item.state === 'Missing')) {
              <ng-container i18n="@@complianceChips.blocksAward">(blocks award)</ng-container>
            }</span
          >&ngsp;
        }
      } @else {
        <span class="prj-hint" i18n="@@complianceChips.allValid">Required documents valid</span>
      }
    }
  `,
})
export class ComplianceChips {
  readonly items = input<readonly ComplianceItem[] | null | undefined>(null);
  readonly attention = computed(() => complianceAttention(this.items()));
  readonly label = complianceStateLabel;
}
