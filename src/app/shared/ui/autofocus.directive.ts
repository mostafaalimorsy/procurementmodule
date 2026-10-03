import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/**
 * Moves focus onto the element when it appears.
 *
 * A confirmation dialog that never takes focus leaves a keyboard user stranded behind it: Escape
 * goes nowhere and Tab walks the page underneath. The element itself is focused rather than a
 * button inside it, so a screen reader announces the dialog before its actions.
 */
@Directive({ selector: '[appAutofocus]' })
export class AutofocusDirective implements AfterViewInit {
  private readonly element = inject(ElementRef<HTMLElement>);

  ngAfterViewInit(): void {
    queueMicrotask(() => this.element.nativeElement.focus?.());
  }
}
