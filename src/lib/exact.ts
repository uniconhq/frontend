/**
 * The API serves every value and reported number exactly, as a string of
 * plain decimal digits, so nothing is lost to a float on the way. They are
 * rounded only here, for display, and compared as the digits they are.
 */

const DECIMAL = /^([-+]?)(\d*)(?:\.(\d*))?(?:[eE]([-+]?\d+))?$/;
/** A whole number in hex or octal, as YAML 1.2's core schema writes one. */
const BASED = /^0x[0-9a-fA-F]+$|^0o[0-7]+$/;
/**
 * The largest power of ten a decimal is worked with at: past it, its digits
 * would take ever longer to build, while no number the format holds comes
 * near it.
 */
const MOST_POWER = 1000;

/** A decimal as a whole number of units and the power of ten of a unit. */
function scaled(text: string): { units: bigint; power: number } | null {
  const trimmed = text.trim();
  if (BASED.test(trimmed)) return { units: BigInt(trimmed), power: 0 };
  const found = DECIMAL.exec(trimmed);
  if (found === null) return null;
  const [, sign = '', whole = '', fraction = '', exponent = '0'] = found;
  if (whole === '' && fraction === '') return null;
  if (Math.abs(Number(exponent)) > MOST_POWER) return null;
  const units = BigInt(`${whole}${fraction}` || '0');
  return {
    units: sign === '-' ? -units : units,
    power: Number(exponent) - fraction.length,
  };
}

/**
 * How two decimals written as text compare, digit for digit, however many
 * digits they have and whatever way each is spelled (`2.5`, `2.50`,
 * `25e-1`, and a whole number as `0x19` or `0o31`, which a definition file
 * may hold): below zero when `a` is less, zero when they are the same
 * number, above zero when `a` is more. Text that is no decimal compares as
 * NaN.
 */
export function compareDecimal(a: string, b: string): number {
  const left = scaled(a);
  const right = scaled(b);
  if (left === null || right === null) return Number.NaN;
  const power = Math.min(left.power, right.power);
  const x = left.units * 10n ** BigInt(left.power - power);
  const y = right.units * 10n ** BigInt(right.power - power);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** An exact fraction of two whole numbers, its denominator above zero. */
export type Ratio = { num: bigint; den: bigint };

/**
 * A fraction as plain decimal digits, rounded half away from zero, or cut
 * toward zero, to at most `places` decimals, and whether that is the
 * fraction exactly: `1/4` is `0.25` exactly, `100/3` is `33.33` and not
 * exact, `200/3` is `66.67` rounded and `66.66` cut.
 */
export function ratioDigits(
  value: Ratio,
  places = 2,
  how: 'round' | 'cut' = 'round',
): { digits: string; exact: boolean } {
  const negative = value.num < 0n;
  const num = negative ? -value.num : value.num;
  const scale = 10n ** BigInt(places);
  const whole = (num * scale) / value.den;
  const left = (num * scale) % value.den;
  const units = how === 'round' && 2n * left >= value.den ? whole + 1n : whole;
  const text = units.toString().padStart(places + 1, '0');
  const digits =
    places === 0 ? text : `${text.slice(0, -places)}.${text.slice(-places)}`;
  const kept = rounded(digits, places);
  return {
    digits: negative && units !== 0n ? `-${kept}` : kept,
    exact: left === 0n,
  };
}

/** The digits of an exact number split at its point, its sign apart. */
type Parts = { negative: boolean; whole: string; fraction: string };

function partsOf(exact: string): Parts {
  const negative = exact.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? exact.slice(1) : exact).split('.');
  return { negative, whole, fraction };
}

/**
 * `exact` rounded half away from zero to at most `places` decimals, with
 * trailing zeros dropped, still as plain digits: `"2.675"` to 2 is `"2.68"`.
 */
export function rounded(exact: string, places: number): string {
  const { negative, whole, fraction } = partsOf(exact);
  if (fraction.length <= places) {
    const kept = fraction.replace(/0+$/, '');
    const digits = kept === '' ? whole : `${whole}.${kept}`;
    return negative && digits.replace(/[0.]/g, '') !== '' ? `-${digits}` : digits;
  }
  const scaled = BigInt(whole + fraction.slice(0, places));
  const up = Number(fraction[places]) >= 5 ? 1n : 0n;
  const digits = (scaled + up).toString().padStart(places + 1, '0');
  const cut =
    places === 0 ? digits : `${digits.slice(0, -places)}.${digits.slice(-places)}`;
  return rounded(negative ? `-${cut}` : cut, places);
}

const locale = new Intl.NumberFormat();
const decimalSign =
  locale.formatToParts(0.5).find((part) => part.type === 'decimal')?.value ?? '.';

/**
 * `exact` for reading, rounded to at most `places` decimals and written the
 * way the reader's locale writes numbers. Its whole part is grouped as an
 * integer and its decimals kept as digits, so a number past what a float
 * holds is shown whole.
 */
export function formatExact(exact: string, places = 4): string {
  const { negative, whole, fraction } = partsOf(rounded(exact, places));
  const grouped = locale.format(BigInt(whole));
  const digits = fraction === '' ? grouped : `${grouped}${decimalSign}${fraction}`;
  return negative ? `-${digits}` : digits;
}
