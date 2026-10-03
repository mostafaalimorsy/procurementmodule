import { DOCUMENT } from '@angular/common';
import { Injectable, LOCALE_ID, inject } from '@angular/core';

export type AppLocale = 'en' | 'ar';
export const LOCALE_COOKIE = 'bidperformance_locale';
const SWITCH_FOCUS = 'bidperformance.locale-switch-focus';

export function isAppLocale(value: string): value is AppLocale {
  return value === 'en' || value === 'ar';
}

/** Preserve encoded route, query and fragment; never interpret query data as a destination. */
export function localizedUrl(url: URL, locale: AppLocale): string {
  const path = url.pathname.replace(/^\/(en|ar)(?=\/|$)/, '') || '/';
  return `/${locale}${path}${url.search}${url.hash}`;
}

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly document = inject(DOCUMENT);
  readonly locale: AppLocale = inject(LOCALE_ID).split('-')[0] === 'ar' ? 'ar' : 'en';
  readonly language = this.locale;
  readonly direction = this.locale === 'ar' ? 'rtl' : 'ltr';
  private switchFragment: { path: string; fragment: string } | null = null;

  initialize(): void {
    this.document.documentElement.lang = this.language;
    this.document.documentElement.dir = this.direction;
    // An explicit locale URL wins over preference. The host uses the cookie only for legacy URLs.
    this.remember(this.locale);
  }

  remember(locale: AppLocale): void {
    const secure = this.document.location.protocol === 'https:' ? '; Secure' : '';
    this.document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }

  /** In-memory custody only, scoped to the active one-time-link component. Never persist tokens. */
  preserveLinkForSwitch(token: string): () => void {
    const entry = {
      path: this.document.location.pathname,
      fragment: token ? `#${new URLSearchParams({ token })}` : '',
    };
    this.switchFragment = entry;
    return () => {
      if (this.switchFragment === entry) this.switchFragment = null;
    };
  }

  switchTo(value: string): void {
    if (!isAppLocale(value) || value === this.locale) return;
    const url = new URL(this.document.location.href);
    if (this.switchFragment?.path === url.pathname) url.hash = this.switchFragment.fragment;
    this.remember(value);
    try {
      this.document.defaultView?.sessionStorage.setItem(SWITCH_FOCUS, '1');
    } catch {
      // Storage restrictions must not prevent switching.
    }
    // replace avoids leaving a second token-bearing or protected route in Back history.
    this.document.location.replace(localizedUrl(url, value));
  }

  restoreSwitchFocus(): void {
    try {
      const storage = this.document.defaultView?.sessionStorage;
      if (storage?.getItem(SWITCH_FOCUS) === '1') {
        storage.removeItem(SWITCH_FOCUS);
        this.document.getElementById('language-selector')?.focus();
      }
    } catch {
      // Normal browser reload focus remains the fallback when storage is unavailable.
    }
  }
}
