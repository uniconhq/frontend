/**
 * The API serves every score, key and reported number exactly, as a string of
 * plain decimal digits, so nothing is lost to a float on the way. They are
 * rounded only here, for display, and compared as the digits they are.
 */

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

const grouped = new Intl.NumberFormat(undefined, { maximumFractionDigits: 100 });

/**
 * `exact` for reading, rounded to at most `places` decimals and grouped the
 * way the reader's locale writes numbers. The grouping reads the rounded
 * digits as a string, so a number past what a float holds is shown whole.
 */
export function formatExact(exact: string, places = 4): string {
  return grouped.format(rounded(exact, places) as Intl.StringNumericLiteral);
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
