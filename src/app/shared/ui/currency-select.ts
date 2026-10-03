import { Component, computed, inject, input, output, signal } from '@angular/core';
import { LocaleService } from '../../core/localization/locale.service';
import { currencyOptionLabel } from '../../core/localization/money';
import { COMMON_CURRENCIES, Currency } from '../../features/company/company.api';

/**
 * Chooses one ISO 4217 currency from the server catalogue: a native select (keyboard and screen-reader
 * friendly on every platform) with the target markets first, and a filter box that narrows the list by code or
 * name in the reader's language. The stored value is always the canonical code.
 */
@Component({
  selector: 'app-currency-select',
  template: `
    <div class="currency-select">
      <input
        type="search"
        class="currency-select__filter"
        [id]="inputId() + '-filter'"
        [attr.aria-controls]="inputId()"
        [disabled]="disabled()"
        [value]="filter()"
        (input)="filter.set($any($event.target).value)"
        autocomplete="off"
        i18n-placeholder="@@currency.filterPlaceholder"
        placeholder="Search currencies"
        i18n-aria-label="@@currency.filterLabel"
        aria-label="Search currencies by code or name"
      />
      <select
        [id]="inputId()"
        [disabled]="disabled()"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        [attr.aria-describedby]="describedBy()"
        (change)="choose($any($event.target).value)"
      >
        @if (!value()) {
          <option value="" [selected]="!value()" i18n="@@currency.choose">Choose a currency</option>
        }
        @if (unlisted(); as code) {
          <!-- A code saved before the catalogue existed stays shown (and kept) until someone picks another. -->
          <option [value]="code" selected i18n="@@currency.unlisted">
            {{ code }} (no longer listed)
          </option>
        }
        @if (common().length) {
          <optgroup label="Common" i18n-label="@@currency.common">
            @for (currency of common(); track currency.code) {
              <option [value]="currency.code" [selected]="currency.code === value()">
                {{ label(currency) }}
              </option>
            }
          </optgroup>
        }
        @if (others().length) {
          <optgroup label="All currencies" i18n-label="@@currency.all">
            @for (currency of others(); track currency.code) {
              <option [value]="currency.code" [selected]="currency.code === value()">
                {{ label(currency) }}
              </option>
            }
          </optgroup>
        }
      </select>
    </div>
  `,
  styles: `
    .currency-select {
      display: grid;
      gap: 0.35rem;
    }
    .currency-select__filter,
    .currency-select select {
      inline-size: 100%;
    }
  `,
})
export class CurrencySelect {
  readonly value = input<string | null>(null);
  readonly currencies = input<readonly Currency[]>([]);
  readonly inputId = input('currency');
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);
  readonly valueChange = output<string>();

  private readonly locale = inject(LocaleService).locale;
  readonly filter = signal('');

  private readonly matching = computed(() => {
    const query = this.filter().trim().toLocaleLowerCase(this.locale);
    const all = this.currencies();
    if (!query) return all;
    // The chosen currency always stays in the list, so filtering never silently changes the selection.
    return all.filter(
      (currency) =>
        currency.code === this.value() ||
        currency.code.toLowerCase().includes(query) ||
        this.label(currency).toLocaleLowerCase(this.locale).includes(query) ||
        currency.name.toLowerCase().includes(query),
    );
  });

  /** The current value when the catalogue (once loaded) does not contain it. */
  readonly unlisted = computed(() => {
    const value = this.value();
    const all = this.currencies();
    return value && all.length && !all.some((currency) => currency.code === value) ? value : null;
  });

  readonly common = computed(() =>
    COMMON_CURRENCIES.map((code) =>
      this.matching().find((currency) => currency.code === code),
    ).filter((currency): currency is Currency => !!currency),
  );

  readonly others = computed(() =>
    this.matching()
      .filter((currency) => !COMMON_CURRENCIES.includes(currency.code))
      .sort((a, b) => a.code.localeCompare(b.code)),
  );

  label(currency: Currency): string {
    return currencyOptionLabel(currency.code, this.locale, currency.name);
  }

  choose(code: string): void {
    if (code) this.valueChange.emit(code);
  }
}
