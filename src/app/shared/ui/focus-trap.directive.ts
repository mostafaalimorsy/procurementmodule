import { Directive, ElementRef, HostListener, inject } from '@angular/core';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab and Shift+Tab inside a modal dialog. `aria-modal` tells assistive technology the page behind is
 * unavailable, but the browser still tabs into it; this wraps focus from the last control to the first and back.
 */
@Directive({ selector: '[appFocusTrap]' })
export class FocusTrapDirective {
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);

  @HostListener('keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const root = this.element.nativeElement;
    const focusable = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (candidate) => !candidate.closest('[hidden]'),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      root.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = root.ownerDocument.activeElement;
    if (event.shiftKey && (active === first || active === root)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
