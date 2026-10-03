import { Component, input } from '@angular/core';
import { CriteriaDeclaration } from './decision.api';

/**
 * CF-040 (ADR-105): which criteria ranked, against what the tender declared at publication — shown on the recommendation, to approvers and
 * beside the award baseline. A change after opening is flagged with its reason.
 */
@Component({
  selector: 'app-criteria-flag',
  template: `
    @switch (declaration()) {
      @case ('declared') {
        <small class="prj-hint tnd-block" i18n="@@criteriaFlag.declared"
          >Declared at publication</small
        >
      }
      @case ('deviated') {
        <small class="tnd-attention tnd-block" i18n="@@criteriaFlag.deviated"
          >Criteria changed after opening: the tender declared
          <bdi>{{ declaredPolicyName() }}</bdi> (version {{ declaredPolicyVersionNumber() }}).
          Reason: <bdi>{{ deviationReason() }}</bdi></small
        >
      }
      @default {
        <small class="prj-hint tnd-block" i18n="@@criteriaFlag.notDeclared"
          >No criteria were declared at publication</small
        >
      }
    }
    @if (evaluationDeviated()) {
      <small class="tnd-attention tnd-block" i18n="@@criteriaFlag.evaluationDeviated"
        >Criteria changed after opening: the technical evaluation used another scorecard policy than
        the tender declared.</small
      >
    }
  `,
})
export class CriteriaFlag {
  readonly declaration = input.required<CriteriaDeclaration>();
  readonly declaredPolicyName = input<string | null>(null);
  readonly declaredPolicyVersionNumber = input<number | null>(null);
  readonly deviationReason = input<string | null>(null);
  readonly evaluationDeviated = input(false);
}
