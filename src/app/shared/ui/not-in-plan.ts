import { Component, OnInit, computed, inject, input } from '@angular/core';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { featureLabel } from '../../core/localization/labels';

/**
 * CF-105 (ADR-122): shown where a section the company's plan does not include would be, so the journey ends with an explanation rather than
 * silently. Presentation only — the API enforces the plan on every call.
 *
 * D-105-1: when it is shown, it reads the plan once more (once per instance), so a feature the operator has added meanwhile replaces the
 * placeholder without a navigation or a new sign-in. Concurrent reads share one request.
 */
@Component({
  selector: 'app-not-in-plan',
  template: `
    <p class="prj-note not-in-plan" role="note" data-testid="not-in-plan">
      <strong i18n="@@notInPlan.title">{{ label() }} is not included in your company plan.</strong>
      @if (administrator()) {
        <span i18n="@@notInPlan.admin"
          >Ask your platform provider or account manager to add it to the plan.</span
        >
      } @else {
        <span i18n="@@notInPlan.member">Ask your Company Admin about adding it to the plan.</span>
      }
    </p>
  `,
  styles: `
    .not-in-plan strong {
      display: block;
    }
  `,
})
export class NotInPlan implements OnInit {
  private readonly session = inject(SessionService);
  private readonly entitlements = inject(EntitlementsService);
  readonly feature = input.required<string>();
  protected readonly label = computed(() => featureLabel(this.feature()));
  protected readonly administrator = computed(() => this.session.managesPlan());

  ngOnInit(): void {
    this.entitlements.refresh().subscribe();
  }
}
