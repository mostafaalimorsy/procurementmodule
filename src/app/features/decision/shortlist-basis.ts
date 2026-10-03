import { Component, computed, input } from '@angular/core';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { ShortlistBasis } from './decision.api';

/**
 * Red-team G073 (CF-057 AC5): when the tender's invitations were issued on a shortlist approved through the low-value fast path
 * (approved vendors, one approver instead of four-eyes prequalification), the decision, approval, award baseline and pack say so —
 * with who approved each fast-path shortlist and when. A four-eyes shortlist shows nothing extra.
 */
@Component({
  selector: 'app-shortlist-basis',
  imports: [BusinessDatePipe],
  template: `
    @if (fastPaths().length) {
      <div class="prj-note" role="note" data-testid="shortlist-basis">
        <span class="prj-chip prj-chip--OnHold sb-chip" i18n="@@decision.fastPathBasis"
          >Shortlist approved through the low-value fast path (approved vendors, one approver)</span
        >
        @for (item of fastPaths(); track item.approvalId) {
          <small class="prj-hint sb-line" i18n="@@decision.fastPathApproval"
            >Shortlist round {{ item.round }} approved by <bdi>{{ item.approvedByName }}</bdi
            >, {{ item.approvedAtUtc | businessDate: 'instant' }}</small
          >
        }
      </div>
    }
  `,
  styles: `
    .sb-chip {
      white-space: normal;
    }
    .sb-line {
      display: block;
    }
  `,
})
export class ShortlistBasisNote {
  readonly basis = input<readonly ShortlistBasis[] | null | undefined>(null);
  readonly fastPaths = computed(() => (this.basis() ?? []).filter((item) => item.fastPath));
}
