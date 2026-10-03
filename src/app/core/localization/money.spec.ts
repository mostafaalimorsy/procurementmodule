import {
  currencyName,
  currencyOptionLabel,
  extension,
  formatAmount,
  parseMoney,
  sumAmounts,
  trimDecimal,
} from './money';

describe('money on the client', () => {
  it('reads what a bidder typed into the exact canonical amount', () => {
    expect(parseMoney('1250000', 2)).toEqual({ value: '1250000.00', problem: null });
    expect(parseMoney('1,250,000.5', 2)).toEqual({ value: '1250000.50', problem: null });
    expect(parseMoney(' 1 250 000 ', 2)).toEqual({ value: '1250000.00', problem: null });
    expect(parseMoney('١٬٢٥٠٬٠٠٠٫٥', 2)).toEqual({ value: '1250000.50', problem: null });
    expect(parseMoney('12.345', 3)).toEqual({ value: '12.345', problem: null });
    expect(parseMoney('1500', 0)).toEqual({ value: '1500', problem: null });
    expect(parseMoney('0007', 2)).toEqual({ value: '7.00', problem: null });
    expect(parseMoney('', 2)).toEqual({ value: null, problem: null });
  });

  it('refuses rather than rounds, truncates or reinterprets', () => {
    expect(parseMoney('12.345', 2).problem).toBe('decimals');
    expect(parseMoney('1.5', 0).problem).toBe('decimals');
    expect(parseMoney('-5', 2).problem).toBe('format');
    expect(parseMoney('1e6', 2).problem).toBe('format');
    expect(parseMoney('QAR 100', 2).problem).toBe('format');
    expect(parseMoney('1000000000000', 2).problem).toBe('range');
    expect(parseMoney('0', 2).problem).toBe('zero');
    expect(parseMoney('0', 2, true)).toEqual({ value: '0.00', problem: null });
  });

  it('never reads a decimal comma as a thousands separator', () => {
    expect(parseMoney('1,5', 2).problem).toBe('grouping');
    expect(parseMoney('1250,50', 2).problem).toBe('grouping');
    expect(parseMoney('12,34,567', 2).problem).toBe('grouping');
    expect(parseMoney('1,250.5,0', 2).problem).toBe('grouping');
    expect(parseMoney('1,250', 2)).toEqual({ value: '1250.00', problem: null });
    expect(parseMoney('12 500 000', 0)).toEqual({ value: '12500000', problem: null });
    expect(parseMoney('1,a50', 2).problem).toBe('format');
  });

  it('formats exact digits with grouping and Latin numerals in both languages', () => {
    expect(formatAmount('1250000.50', 2, 'en')).toBe('1,250,000.50');
    expect(formatAmount('999999999999.99', 2, 'en')).toBe('999,999,999,999.99');
    expect(formatAmount('1250000.50', 2, 'ar')).toMatch(/^1.250.000\.50$/);
    expect(formatAmount('12.345', 3, 'en')).toBe('12.345');
    expect(formatAmount('1500', 0, 'en')).toBe('1,500');
    expect(formatAmount(null, 2, 'en')).toBe('—');
  });

  it('adds amounts exactly, with no floating-point drift', () => {
    expect(sumAmounts(['0.10', '0.20'], 2)).toBe('0.30');
    expect(sumAmounts(['750000.00', '500000.00'], 2)).toBe('1250000.00');
    expect(sumAmounts(['999999999999.99', '0.01'], 2)).toBe('1000000000000.00');
    expect(sumAmounts(['1.001', '2.002'], 3)).toBe('3.003');
    expect(sumAmounts(['1', '2'], 0)).toBe('3');
  });

  it('extends quantity × rate exactly on the currency minor units and never rounds (CF-004)', () => {
    expect(extension('120.125', '85.6', 2)).toEqual({ amount: '10282.70', problem: null });
    // 120.125 × 85.5 = 10 270.6875: not a two-decimal amount, refused rather than rounded.
    expect(extension('120.125', '85.5', 2)).toEqual({ amount: null, problem: 'inexact' });
    expect(extension('120.125', '85.5', 4)).toEqual({ amount: '10270.6875', problem: null });
    expect(extension('3', '0.333333', 0)).toEqual({ amount: null, problem: 'inexact' });
    expect(extension('130', '80.000000', 2)).toEqual({ amount: '10400.00', problem: null });
    // The largest amount is exactly reachable; one more unit of quantity crosses the money maximum.
    expect(extension('1000', '999999999.999', 3)).toEqual({
      amount: '999999999999.000',
      problem: null,
    });
    expect(extension('1001', '999999999.999', 3)).toEqual({ amount: null, problem: 'range' });
    expect(extension('999.999', '999999999.999', 3)).toEqual({ amount: null, problem: 'inexact' });
    expect(extension('0', '5', 2)).toEqual({ amount: '0.00', problem: null });
    expect(trimDecimal('85.600000', 2)).toBe('85.60');
    expect(trimDecimal('120.125')).toBe('120.125');
    expect(trimDecimal('40.000')).toBe('40');
    expect(trimDecimal(null)).toBe('—');
  });

  it('names currencies from the browser and keeps the code independent of language', () => {
    expect(currencyName('QAR', 'en')).toMatch(/Qatar/);
    expect(currencyOptionLabel('USD', 'en')).toMatch(/^USD — /);
    expect(currencyName('ZZZ', 'en', 'Fallback')).toBe('Fallback');
    // Arabic UI does not change the currency, only its name.
    expect(currencyOptionLabel('USD', 'ar')).toMatch(/^USD — /);
  });
});
