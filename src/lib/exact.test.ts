import { describe, expect, it } from 'vitest';
import { compareDecimal, formatExact, ratioDigits, rounded } from './exact';

describe('a number with a huge exponent', () => {
  it('is no decimal to work with, at once rather than after building its digits', () => {
    expect(compareDecimal('1e9999999', '1')).toBeNaN();
    expect(compareDecimal('1e-9999999', '1')).toBeNaN();
    expect(compareDecimal('1e300', '1')).toBe(1);
  });
});

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

  it('takes a whole number written in hex or octal, as YAML 1.2 reads one', () => {
    expect(compareDecimal('0x10', '16')).toBe(0);
    expect(compareDecimal('0o17', '15.0')).toBe(0);
    expect(compareDecimal('0x10', '5')).toBe(1);
    expect(compareDecimal('0x10', '0x10')).toBe(0);
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

describe('exact fractions', () => {
  const ratio = (num: bigint, den: bigint) => ({ num, den });

  it('writes a fraction as digits, saying when they are not exact', () => {
    expect(ratioDigits(ratio(100n, 3n))).toEqual({ digits: '33.33', exact: false });
    expect(ratioDigits(ratio(165n, 2n))).toEqual({ digits: '82.5', exact: true });
    expect(ratioDigits(ratio(2n, 3n), 0)).toEqual({ digits: '1', exact: false });
    expect(ratioDigits(ratio(200n, 3n), 2, 'cut')).toEqual({
      digits: '66.66',
      exact: false,
    });
  });
});
