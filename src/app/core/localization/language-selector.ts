import { Component, afterNextRender, inject } from '@angular/core';
import { LocaleService } from './locale.service';

@Component({
  selector: 'app-language-selector',
  template: `
    <label for="language-selector" i18n="@@locale.language">Language</label>
    <select
      id="language-selector"
      [value]="locale.locale"
      (change)="locale.switchTo($any($event.target).value)"
    >
      <option value="en" lang="en" dir="ltr">English</option>
      <option value="ar" lang="ar" dir="rtl">العربية</option>
    </select>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    label {
      font-size: 0.8rem;
    }
    select {
      max-inline-size: 8rem;
      min-block-size: 2.5rem;
      font: inherit;
      color: var(--color-ink);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 0.2rem;
    }
  `,
})
export class LanguageSelector {
  readonly locale = inject(LocaleService);
  constructor() {
    afterNextRender(() => this.locale.restoreSwitchFocus());
  }
}
