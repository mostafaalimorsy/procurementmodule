import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * CF-020: when a form is submitted and the page marks fields invalid (`aria-invalid="true"`, the product's convention for a field
 * whose error is shown next to it), focus moves to the first of them — so the error is where the user is looking, and a screen reader
 * reads the field with its message. Installed once for the whole application; a form needs nothing to take part.
 */
@Injectable({ providedIn: 'root' })
export class InvalidSubmitFocus {
  private readonly document = inject(DOCUMENT);
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    // Capture: runs for every form, before the page's own handler. The check waits two tasks: the page's handler schedules its change
    // detection (zoneless) after this listener ran, so one task could still read the fields before they are marked.
    this.document.addEventListener(
      'submit',
      (event) => {
        const form = event.target;
        if (form instanceof HTMLFormElement)
          setTimeout(() => setTimeout(() => focusFirstInvalid(form)));
      },
      true,
    );
  }
}

/** Focuses the first field the page marked invalid inside `root`; false when there is none (a valid submit is left alone). */
export function focusFirstInvalid(root: HTMLElement): boolean {
  const field = root.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!field) return false;
  field.focus();
  return true;
}
