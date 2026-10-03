import { SessionService } from '../../core/auth/session.service';
import { COMPANY_EXPORT_URL, TENANT_PERMISSIONS } from '../identity/tenant-identity.api';
import { Component, OnInit, inject, signal } from '@angular/core';
import { LocaleService } from '../../core/localization/locale.service';
import { currencyOptionLabel } from '../../core/localization/money';
import { problemMessage } from '../../core/localization/product-problem';
import { CurrencySelect } from '../../shared/ui/currency-select';
import { GovernanceSettings } from './governance-settings';
import { CompanyApi, CompanyProfile, Currency, LOGO_ACCEPT, LOGO_MAX_BYTES } from './company.api';

/**
 * Company settings (Company Admin): the default currency new projects start from, and the logo bidders see next
 * to the company's name in invitation emails and on the bidder portal. The API decides permission again.
 */
@Component({
  selector: 'app-company-settings',
  imports: [CurrencySelect, GovernanceSettings],
  template: `
    <section class="prj-page">
      <div class="prj-head">
        <div>
          <p class="prj-eyebrow" i18n="@@companyEmail.eyebrow">Company administration</p>
          <h1 i18n="@@companySettings.title">Company settings</h1>
          <p i18n="@@companySettings.intro">
            What your projects and tenders start from, and how bidders recognise your company.
          </p>
        </div>
      </div>
      @if (error()) {
        <p id="company-settings-error" class="prj-note prj-note--error" role="alert" tabindex="-1">
          {{ error() }}
        </p>
      }
      @if (notice()) {
        <p id="company-settings-notice" class="prj-note" role="status" tabindex="-1">
          {{ notice() }}
        </p>
      }
      @if (profile(); as current) {
        <section class="prj-card" aria-labelledby="company-currency-title">
          <h2 id="company-currency-title" i18n="@@companySettings.currencyTitle">
            Default currency
          </h2>
          <p class="prj-hint" i18n="@@companySettings.currencyHelp">
            New projects start in this currency; each project may choose another. Tenders and bids
            use their project's currency. Changing the default never changes existing projects,
            tenders or bids, and the currency does not depend on the interface language.
          </p>
          <p>
            <span i18n="@@companySettings.currencyCurrent">Current default:</span>&ngsp;
            @if (current.defaultCurrency) {
              <strong
                ><bdi dir="ltr">{{ currencyLabel(current.defaultCurrency) }}</bdi></strong
              >
            } @else {
              <strong i18n="@@companySettings.notConfigured">Not configured</strong>
            }
          </p>
          <div class="prj-field">
            <label for="company-currency" i18n="@@companySettings.currencyLabel"
              >Default currency for new projects</label
            >
            <app-currency-select
              inputId="company-currency"
              [value]="currency()"
              [currencies]="currencies()"
              [disabled]="busy()"
              describedBy="company-currency-hint"
              (valueChange)="currency.set($event)"
            />
            <span id="company-currency-hint" class="prj-hint" i18n="@@companySettings.currencyIso"
              >ISO 4217 codes, for example QAR, SAR, AED, EGP or USD.</span
            >
          </div>
          <div class="prj-form-actions">
            <button
              class="prj-btn"
              type="button"
              [disabled]="busy() || !currency() || currency() === current.defaultCurrency"
              (click)="saveCurrency(current)"
              i18n="@@companySettings.saveCurrency"
            >
              Save default currency
            </button>
          </div>
        </section>

        <app-governance-settings />

        <section class="prj-card" aria-labelledby="company-logo-title">
          <h2 id="company-logo-title" i18n="@@companySettings.logoTitle">Company logo</h2>
          <p class="prj-hint" i18n="@@companySettings.logoHelp">
            Shown to invited bidders beside your company name in invitation and reminder emails and
            on the bidder portal. PNG or JPEG, at most 512 KB and 4096 × 4096 pixels.
          </p>
          @if (current.hasLogo && logo()) {
            <figure class="company-logo">
              <img [src]="logo()" [alt]="current.companyName" />
              <figcaption class="prj-hint">
                <bdi dir="ltr">{{ current.logoWidth }} × {{ current.logoHeight }}</bdi>
              </figcaption>
            </figure>
          } @else if (!current.hasLogo) {
            <p i18n="@@companySettings.noLogo">No logo yet: bidders see your company name only.</p>
          }
          <div class="prj-field">
            <label for="company-logo-file" i18n="@@companySettings.logoFile"
              >Choose a logo image</label
            >
            <input
              id="company-logo-file"
              type="file"
              [accept]="accept"
              [disabled]="busy()"
              aria-describedby="company-logo-rules"
              (change)="upload($any($event.target), current)"
            />
            <span id="company-logo-rules" class="prj-hint" i18n="@@companySettings.logoRules"
              >The image is checked on the server; SVG and other formats are not accepted.</span
            >
          </div>
          @if (current.hasLogo) {
            <div class="prj-form-actions">
              @if (confirmingRemove()) {
                <p role="alert" i18n="@@companySettings.removeConfirm">
                  Remove the logo? Bidders will see your company name only.
                </p>
                <button
                  class="prj-btn prj-btn--danger"
                  type="button"
                  [disabled]="busy()"
                  (click)="removeLogo(current)"
                  i18n="@@companySettings.removeLogo"
                >
                  Remove logo
                </button>
                <button
                  class="prj-btn prj-btn--ghost"
                  type="button"
                  (click)="confirmingRemove.set(false)"
                  i18n="@@common.cancel"
                >
                  Cancel
                </button>
              } @else {
                <button
                  class="prj-btn prj-btn--ghost"
                  type="button"
                  [disabled]="busy()"
                  (click)="confirmingRemove.set(true)"
                  i18n="@@companySettings.removeLogo"
                >
                  Remove logo
                </button>
              }
            </div>
          }
        </section>
        <!-- CF-071 (ADR-134): the company's complete, verifiable export (also during a read-only grace). -->
        @if (canManageData()) {
          <section class="prj-card" aria-labelledby="company-data-title">
            <h2 id="company-data-title" i18n="@@companySettings.dataTitle">Your company's data</h2>
            <p class="prj-hint" i18n="@@companySettings.dataHint">
              One ZIP with every record and stored file, and a manifest whose fingerprints let
              anyone verify the evidence without this product. Passwords and secret tokens are never
              included.
            </p>
            <a
              class="prj-btn prj-btn--ghost"
              [href]="exportUrl"
              download
              data-testid="company-export"
              i18n="@@companySettings.export"
              >Download the complete export</a
            >
          </section>
        }
      } @else if (!error()) {
        <p class="prj-note" role="status" i18n="@@companySettings.loading">
          Loading company settings…
        </p>
      }
    </section>
  `,
  styles: `
    .prj-card {
      display: grid;
      gap: 0.75rem;
      margin-block-end: 1rem;
    }
    .company-logo {
      margin: 0;
      display: grid;
      gap: 0.35rem;
      justify-items: start;
    }
    /* A logo is an image of the brand: never mirrored in right-to-left layouts. */
    .company-logo img {
      max-block-size: 5rem;
      max-inline-size: min(18rem, 100%);
      object-fit: contain;
      transform: none;
      border: 1px solid var(--color-border);
      padding: 0.5rem;
      background: #fff;
    }
  `,
})
export class CompanySettingsPage implements OnInit {
  private readonly api = inject(CompanyApi);
  private readonly session = inject(SessionService);
  readonly exportUrl = COMPANY_EXPORT_URL;
  readonly canManageData = () => this.session.hasPermission(TENANT_PERMISSIONS.companyManageData);
  private readonly locale = inject(LocaleService).locale;
  readonly accept = LOGO_ACCEPT;
  readonly profile = signal<CompanyProfile | null>(null);
  readonly currencies = signal<readonly Currency[]>([]);
  readonly currency = signal<string | null>(null);
  readonly logo = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly confirmingRemove = signal(false);

  ngOnInit(): void {
    this.api.currencies().subscribe({
      next: (currencies) => this.currencies.set(currencies),
      error: (error: unknown) => this.error.set(problemMessage(error, { plane: 'tenant' })),
    });
    this.load();
  }

  currencyLabel(code: string): string {
    return currencyOptionLabel(
      code,
      this.locale,
      this.currencies().find((currency) => currency.code === code)?.name,
    );
  }

  saveCurrency(current: CompanyProfile): void {
    const code = this.currency();
    if (!code || this.busy()) return;
    this.run(
      this.api.setDefaultCurrency(code, current.version),
      () =>
        $localize`:@@companySettings.currencySaved:The default currency is saved. New projects start in it.`,
    );
  }

  upload(input: HTMLInputElement, current: CompanyProfile): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy()) return;
    if (file.size > LOGO_MAX_BYTES || !/^image\/(png|jpeg)$/.test(file.type || 'image/png')) {
      this.fail(
        $localize`:@@companySettings.logoTooLarge:Use a PNG or JPEG image of at most 512 KB and 4096 × 4096 pixels.`,
      );
      return;
    }
    this.run(
      this.api.uploadLogo(file, current.version),
      () =>
        $localize`:@@companySettings.logoSaved:The logo is saved. Bidders will see it from the next email or portal visit.`,
    );
  }

  removeLogo(current: CompanyProfile): void {
    if (this.busy()) return;
    this.confirmingRemove.set(false);
    this.run(
      this.api.removeLogo(current.version),
      () => $localize`:@@companySettings.logoRemoved:The logo is removed.`,
    );
  }

  private run(request: ReturnType<CompanyApi['profile']>, success: () => string): void {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    request.subscribe({
      next: (profile) => {
        this.busy.set(false);
        this.apply(profile);
        this.notice.set(success());
        this.focus('company-settings-notice');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.fail(problemMessage(error, { plane: 'tenant', subject: 'record' }));
      },
    });
  }

  private load(): void {
    this.api.profile().subscribe({
      next: (profile) => this.apply(profile),
      error: (error: unknown) => this.error.set(problemMessage(error, { plane: 'tenant' })),
    });
  }

  private apply(profile: CompanyProfile): void {
    this.profile.set(profile);
    this.currency.set(profile.defaultCurrency);
    this.logo.set(null);
    if (profile.hasLogo)
      this.api.logo().subscribe({
        next: (url) => this.logo.set(url),
        error: () => this.logo.set(null),
      });
  }

  private fail(message: string): void {
    this.error.set(message);
    this.focus('company-settings-error');
  }

  private focus(id: string): void {
    setTimeout(() => document.getElementById(id)?.focus());
  }
}
