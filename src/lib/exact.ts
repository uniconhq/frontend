/**
 * The API serves every score, key and reported number exactly, as a string of
 * plain decimal digits, so nothing is lost to a float on the way. They are
 * rounded only here, for display, and compared as the digits they are.
 */

const DECIMAL = /^([-+]?)(\d*)(?:\.(\d*))?(?:[eE]([-+]?\d+))?$/;

/** A decimal as a whole number of units and the power of ten of a unit. */
function scaled(text: string): { units: bigint; power: number } | null {
  const found = DECIMAL.exec(text.trim());
  if (found === null) return null;
  const [, sign = '', whole = '', fraction = '', exponent = '0'] = found;
  if (whole === '' && fraction === '') return null;
  const units = BigInt(`${whole}${fraction}` || '0');
  return {
    units: sign === '-' ? -units : units,
    power: Number(exponent) - fraction.length,
  };
}

/**
 * How two decimals written as text compare, digit for digit, however many
 * digits they have and whatever way each is spelled (`2.5`, `2.50`,
 * `25e-1`): below zero when `a` is less, zero when they are the same
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

/**
 * The fewest decimals, from `places` up, at which no two neighbours in
 * `column` that differ show alike, so a ranking shown rounded never hides
 * why one row is above the next. Null entries, a row with no number, are
 * passed over.
 */
export function placesToTell(column: (string | null)[], places = 2): number {
  const present = column.filter((value): value is string => value !== null);
  const longest = Math.max(
    places,
    ...present.map((value) => partsOf(value).fraction.length),
  );
  for (let tried = places; tried < longest; tried += 1) {
    const alike = present.some(
      (value, index) =>
        index > 0 &&
        value !== present[index - 1] &&
        rounded(value, tried) === rounded(present[index - 1] ?? value, tried),
    );
    if (!alike) return tried;
  }
  return longest;
}
