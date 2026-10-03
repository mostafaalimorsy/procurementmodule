import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * CF-012 (B-012-2): the closeout records — closeouts of awards and past outcomes recorded from documents (CF-002) — as two tabs of
 * one work area, so the main navigation keeps one Closeouts entry. Both pages share the same guard, so both links always open.
 */
@Component({
  selector: 'app-closeout-tabs',
  imports: [RouterLink],
  template: `
    <nav
      class="pf-record-tabs"
      aria-label="Closeout records"
      i18n-aria-label="@@closeouts.tabsLabel"
    >
      <a
        routerLink="/closeouts"
        [class.is-active]="current() === 'closeouts'"
        [attr.aria-current]="current() === 'closeouts' ? 'page' : null"
        i18n="@@nav.closeouts"
        >Closeouts</a
      >
      <a
        routerLink="/retrospective-outcomes"
        [class.is-active]="current() === 'retrospective'"
        [attr.aria-current]="current() === 'retrospective' ? 'page' : null"
        i18n="@@nav.retrospective"
        >Past outcomes</a
      >
    </nav>
  `,
  styles: `
    .pf-record-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1.25rem;
      margin-block: 0 1.25rem;
      border-block-end: 1px solid var(--color-border);
    }

    .pf-record-tabs a {
      display: inline-flex;
      align-items: center;
      min-block-size: var(--touch-target);
      padding: 0.5rem 0.1rem;
      border-block-end: var(--nav-indicator) solid transparent;
      color: var(--color-muted);
      text-decoration: none;
    }

    .pf-record-tabs a.is-active {
      border-block-end-color: var(--color-accent);
      color: var(--color-ink);
      font-weight: 600;
    }

    .pf-record-tabs a:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
  `,
})
export class CloseoutTabs {
  readonly current = input.required<'closeouts' | 'retrospective'>();
}
