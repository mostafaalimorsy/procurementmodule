import { Component, computed, input } from '@angular/core';
import { EvidenceStrength } from './intelligence.api';
import { strengthLabel } from './intelligence-labels';

/**
 * How much finalized evidence stands behind a category (ADR-077): a count threshold in words with a mark — never colour alone and
 * never a probability. "Dated" is said beside it when the newest evidence is older than 24 months.
 */
@Component({
  selector: 'app-evidence-strength',
  template: `<span
      class="intel-strength"
      [class.intel-strength--none]="strength() === 'None'"
      [class.intel-strength--limited]="strength() === 'Limited'"
      >{{ label() }}</span
    >
    @if (dated()) {
      <span class="intel-dated" i18n="@@intel.dated">· newest evidence older than 24 months</span>
    }`,
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      align-items: center;
    }
    .intel-strength {
      display: inline-flex;
      gap: 0.35rem;
      align-items: center;
      padding: 0.1rem 0.5rem;
      border: 1px solid var(--color-border);
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .intel-strength::before {
      content: '';
      inline-size: 0.55rem;
      block-size: 0.55rem;
      border-radius: 50%;
      background: currentcolor;
    }
    .intel-strength--limited::before {
      background: transparent;
      border: 2px solid currentcolor;
    }
    .intel-strength--none {
      color: var(--color-muted);
    }
    .intel-strength--none::before {
      background: transparent;
      border: 2px dashed currentcolor;
    }
    .intel-dated {
      color: var(--color-warning);
      font-size: 0.85rem;
    }
  `,
})
export class EvidenceStrengthBadge {
  readonly strength = input.required<EvidenceStrength>();
  readonly dated = input(false);
  readonly label = computed(() => strengthLabel(this.strength()));
}
