import { formatAmount } from '../../core/localization/money';

// Money on the evaluation screens is the server's exact decimal string. Nothing here uses floating point: grouping is
// done on the digits, and comparisons use scaled big integers.

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** A decimal string grouped for reading, with its own decimal places and sign kept exactly; "—" when missing. */
export function money(amount: string | null | undefined, locale: string): string {
  if (!amount || !DECIMAL.test(amount)) return '—';
  const negative = amount.startsWith('-');
  const digits = negative ? amount.slice(1) : amount;
  const decimals = digits.includes('.') ? digits.split('.')[1].length : 0;
  const grouped = formatAmount(digits, decimals, locale);
  return negative ? `−${grouped}` : grouped;
}

/** A signed adjustment: "+75,000.00" or "−100,000.00". */
export function signedMoney(amount: string | null | undefined, locale: string): string {
  if (!amount || !DECIMAL.test(amount)) return '—';
  return amount.startsWith('-') ? money(amount, locale) : `+${money(amount, locale)}`;
}

function scaled(amount: string, scale: number): bigint {
  const negative = amount.startsWith('-');
  const [whole, fraction = ''] = (negative ? amount.slice(1) : amount).split('.');
  const value =
    BigInt(whole) * 10n ** BigInt(scale) +
    BigInt((fraction + '0'.repeat(scale)).slice(0, scale) || '0');
  return negative ? -value : value;
}

/**
 * How far a value is from a reference, in percent with one decimal and a sign ("+60.0", "−20.0", "0.0"), rounded half away
 * from zero for display only; null when either is missing or the reference is zero.
 */
export function percentFrom(
  value: string | null | undefined,
  reference: string | null | undefined,
): string | null {
  if (!value || !reference || !DECIMAL.test(value) || !DECIMAL.test(reference)) return null;
  const scale = 4;
  const v = scaled(value, scale);
  const r = scaled(reference, scale);
  if (r === 0n) return null;
  // Tenths of a percent: (v − r) × 1000 / r, rounded half away from zero.
  const numerator = (v - r) * 1000n;
  const quotient = numerator / r;
  const remainder = numerator % r;
  const absolute = (x: bigint) => (x < 0n ? -x : x);
  const away = absolute(remainder) * 2n >= absolute(r);
  const positive = numerator < 0n === r < 0n;
  const rounded = away ? quotient + (positive ? 1n : -1n) : quotient;
  const magnitude = rounded < 0n ? -rounded : rounded;
  const text = `${magnitude / 10n}.${magnitude % 10n}`;
  return rounded > 0n ? `+${text}` : rounded < 0n ? `−${text}` : text;
}

/** Compares two decimal strings exactly: negative, zero or positive. */
export function compareAmounts(a: string, b: string): number {
  const scale = 4;
  const difference = scaled(a, scale) - scaled(b, scale);
  return difference === 0n ? 0 : difference < 0n ? -1 : 1;
}
