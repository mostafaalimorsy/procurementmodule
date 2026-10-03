import { Component, input } from '@angular/core';

@Component({
  selector: 'app-status-indicator',
  template: `<span [class]="state()"
    ><span class="dot" aria-hidden="true"></span>{{ labels[state()] }}</span
  >`,
  styles: `
    :host {
      display: inline-block;
      font-size: 0.875rem;
    }
    span {
      display: inline-flex;
      gap: 0.5rem;
      align-items: center;
    }
    .dot {
      inline-size: 0.5rem;
      block-size: 0.5rem;
      border-radius: 50%;
      background: currentColor;
    }
    .healthy {
      color: var(--color-accent);
    }
    .unavailable {
      color: var(--color-warning);
    }
    .checking {
      color: var(--color-muted);
    }
  `,
})
export class StatusIndicator {
  readonly state = input.required<'checking' | 'healthy' | 'unavailable'>();
  protected readonly labels = {
    checking: $localize`:@@statusIndicator.checking:Checking`,
    healthy: $localize`:@@statusIndicator.connected:Connected`,
    unavailable: $localize`:@@statusIndicator.unavailable:Unavailable`,
  };
}
