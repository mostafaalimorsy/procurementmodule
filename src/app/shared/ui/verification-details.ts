import { Component } from '@angular/core';

/**
 * CF-018 (ADR-159): integrity evidence (SHA-256 fingerprints) stays one click away instead of in the main flow — collapsed under
 * "Verification details", where an auditor or a firm comparing its receipt finds it, and everyone else reads past it.
 */
@Component({
  selector: 'app-verification-details',
  template: `
    <details class="verification-details">
      <summary i18n="@@verification.summary">Verification details</summary>
      <ng-content />
    </details>
  `,
  styles: `
    .verification-details {
      margin-block: 0.5rem;
      color: var(--color-muted);
      font-size: 0.85rem;
    }

    .verification-details > summary {
      cursor: pointer;
      inline-size: fit-content;
    }

    .verification-details[open] > summary {
      margin-block-end: 0.35rem;
    }
  `,
})
export class VerificationDetails {}
