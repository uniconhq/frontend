import { describe, expect, it } from 'vitest';
import { compareDecimal, formatExact, placesToTell, rounded } from './exact';

describe('compareDecimal', () => {
  it('compares to the last digit, past what a float holds', () => {
    expect(compareDecimal('1.00000000000000000001', '1.00000000000000000002')).toBe(-1);
    expect(
      compareDecimal(
        '-12345678901234.5678901234567891',
        '-12345678901234.567890123456789',
      ),
    ).toBe(-1);
  });

  it('takes a number spelled another way for the same number', () => {
    expect(compareDecimal('2.5', '2.50')).toBe(0);
    expect(compareDecimal('25e-1', '+2.5')).toBe(0);
    expect(compareDecimal('1e3', '999.9')).toBe(1);
  });

  it('says NaN for text that is no decimal', () => {
    expect(compareDecimal('one', '1')).toBeNaN();
  });
});

describe('rounded', () => {
  it('rounds half away from zero and drops trailing zeros', () => {
    expect(rounded('2.675', 2)).toBe('2.68');
    expect(rounded('-2.675', 2)).toBe('-2.68');
    expect(rounded('82.50', 4)).toBe('82.5');
    expect(rounded('9.995', 2)).toBe('10');
    expect(rounded('0.0004', 3)).toBe('0');
    expect(rounded('-0.0004', 3)).toBe('0');
    expect(rounded('141', 2)).toBe('141');
  });

  it('keeps every digit of a number past what a float holds', () => {
    expect(rounded('100000000000000000001.25', 1)).toBe('100000000000000000001.3');
  });
});

describe('formatExact', () => {
  it('shows a third of 85 to four decimals', () => {
    expect(formatExact('28.33333333333333333333333333')).toBe(
      new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(28.3333),
    );
  });

  it('groups the whole part and keeps every digit past what a float holds', () => {
    const grouped = new Intl.NumberFormat().format(1234567);
    expect(formatExact('1234567.25')).toBe(
      new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(1234567.25),
    );
    expect(formatExact('-1234567')).toBe(`-${grouped}`);
    expect(formatExact('100000000000000000001.25', 1)).toBe(
      `${new Intl.NumberFormat().format(100000000000000000001n)}${
        new Intl.NumberFormat().formatToParts(0.5)[1]?.value ?? '.'
      }3`,
    );
  });
});

describe('placesToTell', () => {
  it('stays at two decimals where neighbours already differ', () => {
    expect(placesToTell(['100', '85.5', '70'])).toBe(2);
  });

  it('takes more digits where two neighbours would show alike', () => {
    expect(placesToTell(['33.3333', '33.3331', '10'])).toBe(4);
  });

  it('passes over rows with no number and ties', () => {
    expect(placesToTell(['50.001', null, '50.001', '50.002'])).toBe(3);
  });
});
