/**
 * Money on the client is text, never a floating-point number: amounts travel as canonical decimal strings
 * ("1250000.00") and are shown with grouping and exactly the currency's decimal places. The ISO code is always
 * shown next to the amount and is independent of the interface language — Arabic does not imply a currency and
 * neither does English. Digits stay Latin, as everywhere else in the product.
 */

/** The largest amount the product stores: twelve integer digits. */
export const MONEY_MAX_INTEGER_DIGITS = 12;

export type MoneyProblem = 'format' | 'grouping' | 'decimals' | 'range' | 'zero';

export interface ParsedMoney {
  readonly value: string | null;
  readonly problem: MoneyProblem | null;
}

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
/** Comma, Arabic thousands mark, no-break and narrow no-break space, space. */
const SEPARATOR = /[,\u066c\u00a0\u202f ]/;
/** Thousands separators are only read as such between groups of exactly three digits, never after the point. */
const GROUPED = /^\d{1,3}([,\u066c\u00a0\u202f ]\d{3})+(\.\d+)?$/;

/**
 * Reads what a person typed into the canonical form, or says why it cannot be stored. Grouping separators
 * (commas, spaces, the Arabic thousands mark) are accepted only between groups of three and removed, so "1,5" is
 * refused ("use a point for decimals") rather than read as fifteen; Arabic-Indic digits and the Arabic decimal
 * mark are read as the same digits. Anything else — signs, exponents, letters, more decimals than the
 * currency has — is refused, never rounded, so the stored value is always exactly what the bidder saw.
 */
export function parseMoney(text: string, decimals: number, allowZero = false): ParsedMoney {
  const trimmed = text.trim();
  if (!trimmed) return { value: null, problem: null };
  const latin = trimmed
    .replace(ARABIC_DIGITS, (digit) => String((digit.charCodeAt(0) & 0x0f) % 10))
    .replace(/٫/g, '.');
  let plain = latin;
  if (SEPARATOR.test(latin)) {
    // Digits and separators alone, but not in thousands groups, is almost always a decimal comma.
    if (!GROUPED.test(latin))
      return {
        value: null,
        problem: /^[\d.,\u066c\u00a0\u202f ]+$/.test(latin) ? 'grouping' : 'format',
      };
    plain = latin.replace(new RegExp(SEPARATOR.source, 'g'), '');
  }
  if (!/^\d+(\.\d+)?$/.test(plain)) return { value: null, problem: 'format' };
  const [whole, fraction = ''] = plain.split('.');
  if (fraction.length > decimals) return { value: null, problem: 'decimals' };
  const integer = whole.replace(/^0+(?=\d)/, '');
  if (integer.length > MONEY_MAX_INTEGER_DIGITS) return { value: null, problem: 'range' };
  const canonical = decimals > 0 ? `${integer}.${fraction.padEnd(decimals, '0')}` : integer;
  if (!allowZero && /^0+(\.0+)?$/.test(canonical)) return { value: null, problem: 'zero' };
  return { value: canonical, problem: null };
}

/** "1250000.00" → "1,250,000.00" in the reader's grouping with Latin digits; the exact digits are kept. */
export function formatAmount(
  amount: string | null | undefined,
  decimals: number,
  locale: string,
): string {
  if (!amount || !/^\d+(\.\d+)?$/.test(amount)) return '—';
  const [whole, fraction = ''] = amount.split('.');
  const grouped = new Intl.NumberFormat(`${locale}-u-nu-latn`, { useGrouping: true }).format(
    BigInt(whole),
  );
  // The decimal point stays "." with Latin digits, as the product's business formatting does in Arabic too.
  return decimals <= 0
    ? grouped
    : `${grouped}.${fraction.padEnd(decimals, '0').slice(0, decimals)}`;
}

/** Adds canonical amounts exactly (as scaled integers), for totals shown next to the bidder's own lines. */
export function sumAmounts(amounts: readonly string[], decimals: number): string {
  const scale = 10n ** BigInt(Math.max(decimals, 0));
  let total = 0n;
  for (const amount of amounts) {
    const [whole, fraction = ''] = amount.split('.');
    total +=
      BigInt(whole) * scale + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
  }
  if (decimals <= 0) return total.toString();
  const text = total.toString().padStart(decimals + 1, '0');
  return `${text.slice(0, -decimals)}.${text.slice(-decimals)}`;
}

/** The localized name of an ISO currency from the browser's own data, falling back to the English ISO name. */
export function currencyName(code: string, locale: string, fallback?: string): string {
  try {
    const names = new Intl.DisplayNames([locale], { type: 'currency' });
    const name = names.of(code);
    if (name && name !== code) return name;
  } catch {
    // Older engines without DisplayNames: the ISO name below.
  }
  return fallback ?? code;
}

/** "QAR — Qatari Riyal" (or its Arabic name); the code itself always stays readable left-to-right. */
export function currencyOptionLabel(code: string, locale: string, fallback?: string): string {
  return `${code} — ${currencyName(code, locale, fallback)}`;
}

/** A canonical decimal ("120.125") as an integer scaled by 10^scale, or null when it has more decimals. */
function scaled(value: string, scale: number): bigint | null {
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  if (trimmed.length > scale) return null;
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(trimmed.padEnd(scale, '0') || '0');
}

export type ExtensionProblem = 'inexact' | 'range';

/**
 * CF-004 (ADR-091): quantity × rate exactly, as the server computes it — never rounded. The amount must fall on the currency's minor
 * units (otherwise `inexact`: the bidder adjusts the rate) and stay below the money maximum (`range`). Inputs are canonical decimals
 * with at most three (quantity) and six (rate) decimals.
 */
export function extension(
  quantity: string,
  rate: string,
  decimals: number,
): { readonly amount: string | null; readonly problem: ExtensionProblem | null } {
  const q = scaled(quantity, 3);
  const r = scaled(rate, 6);
  if (q === null || r === null) return { amount: null, problem: 'inexact' };
  const product = q * r; // scaled by 10^9
  const unit = 10n ** 9n;
  if (product >= 10n ** BigInt(MONEY_MAX_INTEGER_DIGITS) * unit)
    return { amount: null, problem: 'range' };
  const step = 10n ** BigInt(9 - Math.max(decimals, 0));
  if (product % step !== 0n) return { amount: null, problem: 'inexact' };
  const minor = product / step;
  if (decimals <= 0) return { amount: minor.toString(), problem: null };
  const text = minor.toString().padStart(decimals + 1, '0');
  return { amount: `${text.slice(0, -decimals)}.${text.slice(-decimals)}`, problem: null };
}

/** An exact decimal for display: trailing zeros beyond `keep` decimals dropped ("85.600000" → "85.60" with keep 2), never rounded. */
export function trimDecimal(value: string | null | undefined, keep = 0): string {
  if (!value) return '—';
  if (!value.includes('.')) return value;
  const [whole, fraction] = value.split('.');
  let end = fraction.length;
  while (end > keep && fraction[end - 1] === '0') end--;
  return end === 0 ? whole : `${whole}.${fraction.slice(0, end)}`;
}
