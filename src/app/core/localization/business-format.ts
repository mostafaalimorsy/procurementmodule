import { Injectable, Pipe, PipeTransform, inject } from '@angular/core';
import { LocaleService } from './locale.service';
import { localDateTimeParts } from './zoned-time';

/** Commercial values always use Gregorian dates and Latin digits, including Arabic UI. */
@Injectable({ providedIn: 'root' })
export class BusinessFormat {
  private readonly locale = inject(LocaleService);
  private get tag(): string {
    return `${this.locale.locale}-u-ca-gregory-nu-latn`;
  }

  dateOnly(value: string | null | undefined): string {
    if (!value) return '—';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—';
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) return '—';
    return new Intl.DateTimeFormat(this.tag, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  /** Instants are presented explicitly in UTC; a date-only string is not an instant. */
  dateTime(value: string | null | undefined): string {
    if (!value || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return '—';
    return new Intl.DateTimeFormat(this.tag, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    }).format(date);
  }

  /** A month label ("Oct 2026" / "أكتوبر 2026") for a date-only value, Gregorian with Latin digits like every business date. */
  month(value: string): string {
    return monthLabel(value, this.locale.locale);
  }

  number(value: number | null | undefined): string {
    return value == null || !Number.isFinite(value)
      ? '—'
      : new Intl.NumberFormat(this.tag).format(value);
  }

  /**
   * An amount with its ISO code. Decimal strings (the product's money wire form) are formatted exactly — Intl formats a numeric string as an
   * exact decimal — so no amount is ever converted to floating point on the way to the screen (ADR-050, CF-110).
   */
  currency(value: string | number | null | undefined, currency: string | null | undefined): string {
    if (value == null || !currency || !/^[A-Z]{3}$/.test(currency)) return '—';
    if (typeof value === 'number' ? !Number.isFinite(value) : !/^-?\d+(\.\d+)?$/.test(value))
      return '—';
    return new Intl.NumberFormat(this.tag, {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      // A string is formatted as an exact decimal (Intl.NumberFormat v3); the cast only satisfies the ES2022 lib typing.
    }).format(value as unknown as number);
  }
}

/** A month label for a date-only value ("2026-10-01" → "Oct 2026"), Gregorian with Latin digits (CF-098). */
export function monthLabel(value: string, locale: string): string {
  return new Intl.DateTimeFormat(`${locale}-u-ca-gregory-nu-latn`, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

/** A tender-local time as the API sends it: the wall-clock value in the tender's zone and its UTC offset. */
export interface ZonedLocalTime {
  readonly local: string;
  readonly offset?: string | null;
  readonly utc?: string | null;
}

/**
 * A tender-local "YYYY-MM-DDTHH:mm" shown with its zone and offset, e.g. "15 Oct 2026, 14:00 (Asia/Riyadh, UTC+03:00)" (CF-098: deadlines
 * read in the tender's zone, one pattern everywhere).
 */
export function tenderLocalTime(time: ZonedLocalTime | null, zone: string, locale: string): string {
  if (!time) return '—';
  const [date, clock] = time.local.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const shown = new Intl.DateTimeFormat(`${locale}-u-ca-gregory-nu-latn`, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
  const comma = locale === 'ar' ? '، ' : ', ';
  // CF-099: in Arabic the zone and offset are Latin tokens inside right-to-left text; isolating them (LRI … PDI) keeps "UTC+03:00" and
  // "Asia/Riyadh" whole and in order instead of letting the bidi algorithm move the punctuation.
  const ltr = (token: string) => (locale === 'ar' ? `\u2066${token}\u2069` : token);
  return `${shown}${comma}${clock} (${ltr(zone)}${time.offset ? `${comma}${ltr(`UTC${time.offset}`)}` : ''})`;
}

/**
 * Red-team G050 (CF-039): a UTC instant shown in a tender's zone, in the same pattern as every tender-local time
 * ("30 Dec 2026, 12:00 (Asia/Qatar, UTC+03:00)"). Without a known zone the instant is shown explicitly in UTC, as before.
 */
export function zonedInstant(
  value: string | null | undefined,
  zone: string | null | undefined,
  locale: string,
): string {
  if (!value || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return '—';
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) return '—';
  if (!zone || !isKnownZone(zone)) return utcInstant(instant, locale);
  const local = localDateTimeParts(instant, zone);
  // The zone's offset at that instant: the wall-clock value read as UTC, minus the instant (whole minutes).
  const wall = Date.UTC(
    Number(local.slice(0, 4)),
    Number(local.slice(5, 7)) - 1,
    Number(local.slice(8, 10)),
    Number(local.slice(11, 13)),
    Number(local.slice(14, 16)),
  );
  const minutes = Math.round((wall - Math.floor(instant.valueOf() / 60000) * 60000) / 60000);
  const sign = minutes < 0 ? '-' : '+';
  const pad = (part: number) => String(part).padStart(2, '0');
  const offset = `${sign}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
  return tenderLocalTime({ local, offset }, zone, locale);
}

function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function utcInstant(instant: Date, locale: string): string {
  return new Intl.DateTimeFormat(`${locale}-u-ca-gregory-nu-latn`, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(instant);
}

export function fileSize(bytes: number, locale: string): string {
  // The unit is localized by the platform (MB / ميغابايت); digits stay Latin, as elsewhere in the product.
  // CF-098: one pattern for every file — kilobytes or megabytes (a 793-byte file is "0.8 kB", never "793 byte").
  const [value, unit] =
    bytes >= 1024 * 1024
      ? [bytes / (1024 * 1024), 'megabyte']
      : [Math.max(bytes / 1024, 0.1), 'kilobyte'];
  return new Intl.NumberFormat(`${locale}-u-nu-latn`, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);
}

@Pipe({ name: 'businessDate' })
export class BusinessDatePipe implements PipeTransform {
  private readonly format = inject(BusinessFormat);
  transform(value: string | null | undefined, kind: 'date' | 'instant' = 'date'): string {
    return kind === 'instant' ? this.format.dateTime(value) : this.format.dateOnly(value);
  }
}
/** Red-team G050: `instant | zonedInstant: timeZoneId` — a UTC instant in the tender's zone (UTC when the zone is unknown). */
@Pipe({ name: 'zonedInstant' })
export class ZonedInstantPipe implements PipeTransform {
  private readonly locale = inject(LocaleService);
  transform(value: string | null | undefined, zone: string | null | undefined): string {
    return zonedInstant(value, zone, this.locale.locale);
  }
}
@Pipe({ name: 'businessCurrency' })
export class BusinessCurrencyPipe implements PipeTransform {
  private readonly format = inject(BusinessFormat);
  transform(
    value: string | number | null | undefined,
    currency: string | null | undefined,
  ): string {
    return this.format.currency(value, currency);
  }
}
@Pipe({ name: 'businessNumber' })
export class BusinessNumberPipe implements PipeTransform {
  private readonly format = inject(BusinessFormat);
  transform(value: number | null | undefined): string {
    return this.format.number(value);
  }
}
