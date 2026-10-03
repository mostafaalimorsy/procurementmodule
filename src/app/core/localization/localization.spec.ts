import { DOCUMENT } from '@angular/common';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BusinessFormat } from './business-format';
import { LocaleService, LOCALE_COOKIE, localizedUrl } from './locale.service';
import { LanguageSelector } from './language-selector';
import { knownProductProblem } from './product-problem';
import { formatList, roleList } from './labels';
import { fileSize, monthLabel, tenderLocalTime, zonedInstant } from './business-format';
import { localDateTimeParts } from './zoned-time';
import {
  takeTokenFromFragment,
  tenantProblemMessage,
} from '../../features/identity/tenant-identity.api';
import { HttpErrorResponse } from '@angular/common/http';
import { PolicyFields } from '../../features/platform/policy-fields';

function setup(locale = 'en') {
  const replace = vi.fn();
  const focus = vi.fn();
  const document = {
    documentElement: { lang: '', dir: '' },
    location: {
      href: `https://example.test/${locale}/projects/P-01?sort=Code#details`,
      pathname: `/${locale}/projects/P-01`,
      protocol: 'https:',
      replace,
    },
    cookie: '',
    defaultView: { sessionStorage: new MapStorage() },
    getElementById: () => ({ focus }),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCALE_ID, useValue: locale },
      { provide: DOCUMENT, useValue: document },
    ],
  });
  return { service: TestBed.inject(LocaleService), document, replace, focus };
}
class MapStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('Locale foundation', () => {
  it.each([
    ['en', 'ltr'],
    ['ar', 'rtl'],
  ])('sets document language and direction for %s', (locale, direction) => {
    const { service, document } = setup(locale);
    service.initialize();
    expect(service.locale).toBe(locale);
    expect(service.language).toBe(locale);
    expect(service.direction).toBe(direction);
    expect(document.documentElement).toEqual({ lang: locale, dir: direction });
  });

  it('persists the explicit build locale over an older preference with root path and SameSite', () => {
    const { service, document } = setup('ar');
    document.cookie = `${LOCALE_COOKIE}=en`;
    service.initialize();
    expect(document.cookie).toBe(
      `${LOCALE_COOKIE}=ar; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );
  });

  it('supports the explicit local HTTP development environment', () => {
    const { service, document } = setup();
    document.location.protocol = 'http:';
    service.remember('ar');
    expect(document.cookie).not.toContain('Secure');
  });

  it.each([
    [
      '/en/projects/P%2F01?sort=Code&x=%2B#details',
      'ar',
      '/ar/projects/P%2F01?sort=Code&x=%2B#details',
    ],
    ['/ar/platform/companies/1', 'en', '/en/platform/companies/1'],
    [
      '/accept-invitation?source=email#token=a%2Bb%2Fc%3D',
      'ar',
      '/ar/accept-invitation?source=email#token=a%2Bb%2Fc%3D',
    ],
    ['/en/reset-password#token=abc', 'ar', '/ar/reset-password#token=abc'],
    ['/ar', 'en', '/en/'],
    ['/enough/path', 'ar', '/ar/enough/path'],
  ] as const)('preserves routing for %s', (path, locale, expected) => {
    expect(localizedUrl(new URL(path, 'https://example.test'), locale)).toBe(expected);
  });

  it('replaces history on selection and restores focus exactly once', () => {
    const { service, replace, focus } = setup();
    service.switchTo('ar');
    expect(replace).toHaveBeenCalledWith('/ar/projects/P-01?sort=Code#details');
    service.restoreSwitchFocus();
    service.restoreSwitchFocus();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('ignores unsupported and unchanged selections', () => {
    const { service, replace } = setup();
    service.switchTo('fr');
    service.switchTo('en');
    expect(replace).not.toHaveBeenCalled();
  });

  it('switches even if preference session storage is restricted', () => {
    const { service, document, replace } = setup();
    vi.spyOn(document.defaultView.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('restricted');
    });
    service.switchTo('ar');
    expect(replace).toHaveBeenCalled();
  });

  it.each(['accept-invitation', 'reset-password'])(
    'transfers an in-memory %s token only on its own route',
    (path) => {
      const { service, document, replace } = setup();
      document.location.pathname = `/en/${path}`;
      document.location.href = `https://example.test/en/${path}?from=email`;
      const release = service.preserveLinkForSwitch('secret+/=');
      service.switchTo('ar');
      expect(replace).toHaveBeenLastCalledWith(`/ar/${path}?from=email#token=secret%2B%2F%3D`);
      expect(document.cookie).not.toContain('secret');
      expect(document.defaultView.sessionStorage.getItem('token')).toBeNull();
      document.location.pathname = '/en/login';
      document.location.href = 'https://example.test/en/login';
      service.switchTo('ar');
      expect(replace).toHaveBeenLastCalledWith('/ar/login');
      document.location.pathname = `/en/${path}`;
      document.location.href = `https://example.test/en/${path}`;
      release();
      service.switchTo('ar');
      expect(replace).toHaveBeenLastCalledWith(`/ar/${path}`);
    },
  );

  it('keeps token consumption and fragment scrubbing intact for localized routes', () => {
    window.history.replaceState(null, '', '/ar/reset-password?from=email#token=secret%2Bvalue');
    expect(takeTokenFromFragment()).toBe('secret+value');
    expect(window.location.pathname + window.location.search).toBe('/ar/reset-password?from=email');
    expect(window.location.hash).toBe('');
    window.history.replaceState(null, '', '/');
  });
});

describe('Commercial formatting', () => {
  it.each(['en', 'ar'])('keeps date-only Gregorian and timezone independent in %s', (locale) => {
    setup(locale);
    const format = TestBed.inject(BusinessFormat);
    const result = format.dateOnly('2026-01-01');
    expect(result).toContain('2026');
    expect(result).toContain('1');
    expect(result).not.toMatch(/[\u0660-\u0669\u06f0-\u06f9]/);
    expect(format.dateOnly('2026-02-30')).toBe('—');
    expect(format.dateOnly('2026-01-01T00:00:00Z')).toBe('—');
    expect(format.dateOnly(null)).toBe('—');
  });

  it('formats instants explicitly in UTC without treating a date-only as an instant', () => {
    setup('ar');
    const format = TestBed.inject(BusinessFormat);
    expect(format.dateTime('2026-01-01T23:00:00-03:00')).toMatch(/2.*2026/);
    expect(format.dateTime('2026-01-01T23:00:00-03:00')).toContain('UTC');
    expect(format.dateTime('2026-01-01')).toBe('—');
  });

  it('uses Latin digits, actual ISO currency and currency precision in Arabic', () => {
    setup('ar');
    const format = TestBed.inject(BusinessFormat);
    expect(format.number(12345.67)).toBe('12,345.67');
    expect(format.currency(12345.67, 'EGP')).toContain('12,345.67');
    expect(format.currency(12345.67, 'EGP')).toContain('EGP');
    expect(format.currency(12.3, 'KWD')).toContain('12.300');
    expect(format.currency(12, 'JPY')).not.toContain('.00');
    expect(format.currency(null, 'EGP')).toBe('—');
    expect(format.currency(12, null)).toBe('—');
  });
});

describe('Localization UI primitives', () => {
  it('exposes an accessible native language selector with both endonyms', () => {
    const fixture = TestBed.createComponent(LanguageSelector);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('label').htmlFor).toBe('language-selector');
    expect(fixture.nativeElement.querySelector('select').value).toBe('en');
    expect(fixture.nativeElement.textContent).toContain('English');
    expect(fixture.nativeElement.textContent).toContain('العربية');
  });

  it('isolates domain, IP/CIDR and country-code form values without converting their data', () => {
    const fixture = TestBed.createComponent(PolicyFields);
    fixture.detectChanges();
    const fields = fixture.nativeElement.querySelectorAll('textarea');
    expect(fields.length).toBe(3);
    for (const field of fields) expect(field.dir).toBe('ltr');
    fixture.componentInstance.ips = '2001:db8::/32';
    const emit = vi.spyOn(fixture.componentInstance.policyChange, 'emit');
    fixture.componentInstance.changed();
    expect(emit.mock.calls[0][0].ipRules).toEqual(['2001:db8::/32']);
  });

  it('localizes known stable codes and retains legacy English fallback details', () => {
    expect(knownProductProblem({ code: 'validation.required' })).toBe(
      'Complete the required fields.',
    );
    expect(knownProductProblem({ code: 'future.code', parameters: { count: 3 } })).toBeNull();
    expect(
      tenantProblemMessage(
        new HttpErrorResponse({
          status: 400,
          error: { code: 'validation.required', detail: 'Legacy English detail.' },
        }),
      ),
    ).toBe('Complete the required fields.');
    expect(
      tenantProblemMessage(
        new HttpErrorResponse({
          status: 400,
          error: { code: 'future.code', detail: 'Existing safe detail.' },
        }),
      ),
    ).toBe('Existing safe detail.');
  });
});

describe('Role names from the permission matrix (S-ROLES)', () => {
  it('names the roles as one readable "or" list, in matrix order', () => {
    expect(roleList(['CompanyAdmin'], 'en')).toBe('Company Admin');
    expect(roleList(['CompanyAdmin', 'ProcurementManager'], 'en')).toBe(
      'Company Admin or Procurement Manager',
    );
    expect(roleList(['CompanyAdmin', 'ProcurementManager', 'ApproverDirector'], 'en')).toBe(
      'Company Admin, Procurement Manager, or Approver / Director',
    );
    // Arabic joins with «أو».
    expect(roleList(['CompanyAdmin', 'ProcurementManager'], 'ar')).toMatch(/ أو /);
    // An unknown role keeps its stable name rather than pretending to know it.
    expect(roleList(['FutureRole'], 'en')).toBe('FutureRole');
  });

  it('falls back to a comma list when the engine cannot format the locale', () => {
    const original = Intl.ListFormat;
    (Intl as unknown as { ListFormat: unknown }).ListFormat = function () {
      throw new RangeError('unsupported');
    };
    try {
      expect(formatList(['a', 'b'], 'en', 'disjunction')).toBe('a, b');
    } finally {
      (Intl as unknown as { ListFormat: unknown }).ListFormat = original;
    }
  });
});

describe('Formatting lives in core/localization (CF-098 AC3)', () => {
  it('shows months, tender-local times and file sizes Gregorian with Latin digits in both languages', () => {
    expect(monthLabel('2026-10-01', 'en')).toBe('Oct 2026');
    const arabicMonth = monthLabel('2026-10-01', 'ar');
    expect(arabicMonth).toContain('2026');
    expect(arabicMonth).not.toMatch(/[\u0660-\u0669]/);
    expect(
      tenderLocalTime({ local: '2026-10-15T14:00', offset: '+03:00' }, 'Asia/Riyadh', 'en'),
    ).toBe('Oct 15, 2026, 14:00 (Asia/Riyadh, UTC+03:00)');
    expect(tenderLocalTime(null, 'Asia/Riyadh', 'en')).toBe('—');
    expect(fileSize(793, 'en')).toBe('0.8 kB');
    expect(fileSize(2.5 * 1024 * 1024, 'ar')).not.toMatch(/[\u0660-\u0669]/);
  });

  it('reads an instant as a local time in a zone, and in UTC when the zone is unknown', () => {
    const instant = new Date('2026-10-15T11:00:00Z');
    expect(localDateTimeParts(instant, 'Asia/Riyadh')).toBe('2026-10-15T14:00');
    expect(localDateTimeParts(instant, 'Not/AZone')).toBe('2026-10-15T11:00');
  });
});

describe('A UTC instant in the tender zone (red-team G050)', () => {
  it('shows the wall-clock time, the zone and its offset at that instant, including daylight saving', () => {
    expect(zonedInstant('2026-12-30T09:00:00Z', 'Asia/Qatar', 'en')).toBe(
      'Dec 30, 2026, 12:00 (Asia/Qatar, UTC+03:00)',
    );
    expect(zonedInstant('2026-07-01T09:00:00Z', 'Europe/London', 'en')).toBe(
      'Jul 1, 2026, 10:00 (Europe/London, UTC+01:00)',
    );
    expect(zonedInstant('2026-01-10T09:00:00Z', 'America/New_York', 'en')).toBe(
      'Jan 10, 2026, 04:00 (America/New_York, UTC-05:00)',
    );
    expect(zonedInstant('2026-03-01T23:30:00Z', 'Asia/Kolkata', 'en')).toBe(
      'Mar 2, 2026, 05:00 (Asia/Kolkata, UTC+05:30)',
    );
  });

  it('falls back to an explicit UTC instant for an unknown or missing zone, and a dash for no instant', () => {
    for (const zone of [null, undefined, '', 'Not/AZone']) {
      const shown = zonedInstant('2026-12-30T09:00:00Z', zone, 'en');
      expect(shown).toContain('Dec 30, 2026');
      expect(shown).toContain('UTC');
    }
    expect(zonedInstant(null, 'Asia/Qatar', 'en')).toBe('—');
    expect(zonedInstant('2026-12-30', 'Asia/Qatar', 'en')).toBe('—');
  });
});
