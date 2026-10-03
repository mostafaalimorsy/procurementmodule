import { DOCUMENT } from '@angular/common';
import { Component, OnDestroy, inject, input, output } from '@angular/core';
import { AutofocusDirective } from './autofocus.directive';
import { FocusTrapDirective } from './focus-trap.directive';

let nextId = 0;

/**
 * A consequential decision, stated before it happens. The body explains the consequence; the
 * confirm label names the action. Focus moves into the dialog and returns to the control that
 * opened it, so a keyboard user is never left at the top of the page.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [AutofocusDirective, FocusTrapDirective],
  template: `
    <div
      class="prj-dialog"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      appAutofocus
      appFocusTrap
      [attr.aria-labelledby]="titleId"
      [attr.aria-describedby]="bodyId"
      (keydown.escape)="busy() || cancelled.emit()"
    >
      <div>
        <h2 [id]="titleId">{{ heading() }}</h2>
        <div [id]="bodyId"><ng-content /></div>
        <div class="prj-actions">
          <button
            class="prj-btn"
            [class.prj-btn--danger]="danger()"
            type="button"
            [disabled]="busy()"
            (click)="confirmed.emit()"
          >
            @if (busy()) {
              <ng-container i18n="@@common.working">Working…</ng-container>
            } @else {
              {{ confirmLabel() }}
            }
          </button>
          <!-- While the action runs it can no longer be called off, so the dialog stays until it finishes. -->
          <button
            class="prj-btn prj-btn--ghost"
            type="button"
            [disabled]="busy()"
            (click)="cancelled.emit()"
          >
            @if (cancelLabel(); as label) {
              {{ label }}
            } @else {
              <ng-container i18n="@@common.cancel">Cancel</ng-container>
            }
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmDialog implements OnDestroy {
  readonly heading = input.required<string>();
  readonly confirmLabel = input.required<string>();
  /** CF-019: names what declining keeps ("Keep project") where "Cancel" would be ambiguous. */
  readonly cancelLabel = input<string>('');
  readonly danger = input(false);
  readonly busy = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  protected readonly titleId = `confirm-title-${++nextId}`;
  protected readonly bodyId = `confirm-body-${nextId}`;
  private readonly opener = inject(DOCUMENT).activeElement as HTMLElement | null;

  ngOnDestroy(): void {
    if (this.opener?.isConnected) this.opener.focus();
  }
}
