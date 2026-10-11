import { describe, expect, it } from 'vitest';
import {
  addRatio,
  compareDecimal,
  compareRatio,
  divRatio,
  formatExact,
  formatRatio,
  mulRatio,
  placesToTell,
  ratioDigits,
  ratioOf,
  rounded,
  ZERO,
} from './exact';

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

describe('exact fractions', () => {
  const r = (text: string) => ratioOf(text) ?? ZERO;

  it('reads a decimal as the fraction it is, past what a float holds', () => {
    expect(ratioOf('0.1')).toEqual({ num: 1n, den: 10n });
    expect(ratioOf('2.50')).toEqual({ num: 5n, den: 2n });
    expect(ratioOf('1e3')).toEqual({ num: 1000n, den: 1n });
    expect(ratioOf('0.1000000000000000000001')).toEqual({
      num: 1000000000000000000001n,
      den: 10000000000000000000000n,
    });
    expect(ratioOf('thirty')).toBeNull();
  });

  it('adds, multiplies and divides exactly', () => {
    expect(addRatio(r('0.1'), r('0.2'))).toEqual(r('0.3'));
    expect(mulRatio(r('100'), divRatio(r('30'), r('120')))).toEqual(r('25'));
    expect(compareRatio(divRatio(r('1'), r('3')), r('0.333'))).toBe(1);
  });

  it('writes a fraction as digits, saying when they are not exact', () => {
    expect(ratioDigits(divRatio(r('100'), r('3')))).toEqual({
      digits: '33.33',
      exact: false,
    });
    expect(ratioDigits(r('82.5'))).toEqual({ digits: '82.5', exact: true });
    expect(ratioDigits(divRatio(r('2'), r('3')), 0)).toEqual({
      digits: '1',
      exact: false,
    });
    expect(formatRatio(r('72'))).toBe('72');
    expect(formatRatio(divRatio(r('200'), r('3')))).toBe(
      `about ${formatExact('66.67')}`,
    );
  });
});
