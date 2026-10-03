import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CompanySettingsPage } from './company-settings';
import { CompanyProfile } from './company.api';

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');
const profile = (overrides: Partial<CompanyProfile> = {}): CompanyProfile => ({
  companyName: 'Delta Construction',
  defaultCurrency: null,
  hasLogo: false,
  logoContentType: null,
  logoWidth: null,
  logoHeight: null,
  logoUpdatedAtUtc: null,
  canManage: true,
  version: '00000000-0000-0000-0000-000000000000',
  ...overrides,
});

function render(current: CompanyProfile = profile()) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(CompanySettingsPage);
  fixture.detectChanges();
  http.expectOne('/api/v1/company/currencies').flush([
    { code: 'QAR', name: 'Qatari Rial', minorUnits: 2 },
    { code: 'SAR', name: 'Saudi Riyal', minorUnits: 2 },
    { code: 'KWD', name: 'Kuwaiti Dinar', minorUnits: 3 },
    { code: 'ZAR', name: 'Rand', minorUnits: 2 },
  ]);
  http.expectOne('/api/v1/company/profile').flush(current);
  fixture.detectChanges();
  return {
    http,
    fixture,
    element: fixture.nativeElement as HTMLElement,
    page: fixture.componentInstance,
  };
}

describe('company settings', () => {
  it('says "not configured" instead of guessing, and saves the chosen ISO code with the version', () => {
    const { http, fixture, element } = render();
    expect(text(element)).toContain('Current default: Not configured');
    const select = element.querySelector('select#company-currency') as HTMLSelectElement;
    // The target markets come first, then every other currency.
    expect([...select.querySelectorAll('optgroup')].map((group) => group.label)).toEqual([
      'Common',
      'All currencies',
    ]);
    expect([...select.options].map((option) => option.value)).toEqual([
      '',
      'QAR',
      'SAR',
      'KWD',
      'ZAR',
    ]);
    select.value = 'SAR';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    (
      [...element.querySelectorAll('button')].find((button) =>
        text(button).includes('Save default currency'),
      ) as HTMLButtonElement
    ).click();
    const save = http.expectOne('/api/v1/company/profile/currency');
    expect(save.request.method).toBe('PUT');
    expect(save.request.body).toEqual({
      currency: 'SAR',
      version: '00000000-0000-0000-0000-000000000000',
    });
    save.flush(profile({ defaultCurrency: 'SAR', version: 'v2' }));
    fixture.detectChanges();
    expect(text(element)).toContain('The default currency is saved.');
    expect(text(element)).toMatch(/Current default: SAR — /);
  });

  it('filters the list by code or name without losing the current choice', () => {
    const { fixture, element } = render(profile({ defaultCurrency: 'QAR', version: 'v1' }));
    const filter = element.querySelector('#company-currency-filter') as HTMLInputElement;
    filter.value = 'rand';
    filter.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const values = [
      ...(element.querySelector('select#company-currency') as HTMLSelectElement).options,
    ].map((option) => option.value);
    expect(values).toEqual(['QAR', 'ZAR']);
  });

  it('refuses an oversized or non-image logo before uploading, uploads a PNG and confirms removal', () => {
    const { http, fixture, element } = render(profile({ version: 'v1' }));
    const input = element.querySelector('#company-logo-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File([new Uint8Array(600 * 1024)], 'big.png', { type: 'image/png' })],
    });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    http.expectNone('/api/v1/company/profile/logo');
    expect(text(element)).toContain('at most 512 KB');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })],
    });
    input.dispatchEvent(new Event('change'));
    http.expectNone('/api/v1/company/profile/logo');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File([new Uint8Array(100)], 'logo.png', { type: 'image/png' })],
    });
    input.dispatchEvent(new Event('change'));
    const upload = http.expectOne('/api/v1/company/profile/logo');
    expect((upload.request.body as FormData).get('version')).toBe('v1');
    upload.flush(
      profile({
        hasLogo: true,
        logoContentType: 'image/png',
        logoWidth: 200,
        logoHeight: 60,
        version: 'v2',
      }),
    );
    http
      .expectOne('/api/v1/company/profile/logo')
      .flush(new Blob([new Uint8Array([1])], { type: 'image/png' }));
    fixture.detectChanges();
    (
      [...element.querySelectorAll('button')].find((button) =>
        text(button).includes('Remove logo'),
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(text(element)).toContain('Remove the logo? Bidders will see your company name only.');
    ([...element.querySelectorAll('.prj-btn--danger')][0] as HTMLButtonElement).click();
    const remove = http.expectOne('/api/v1/company/profile/logo/remove');
    expect(remove.request.body).toEqual({ version: 'v2' });
  });
});
