/**
 * A fraction and the percentage it is, both as exact decimal text, so a late
 * penalty typed as a percentage is written to the file as the fraction it
 * means to the last digit, and read back the same: `0.1` is `10`, `0.125`
 * is `12.5`, `1` is `100`. Text that is no plain decimal comes back as it is.
 */

const PLAIN = /^(\d*)(?:\.(\d*))?$/;

/** Move the point `by` places, right for a positive `by`, keeping every digit. */
function shifted(text: string, by: number): string {
  const found = PLAIN.exec(text.trim());
  if (found === null || text.trim() === '' || text.trim() === '.') return text;
  const [, whole = '', fraction = ''] = found;
  const digits = `${whole}${fraction}`;
  const point = whole.length + by;
  const padded =
    point < 0
      ? `${'0'.repeat(-point)}${digits}`
      : point > digits.length
        ? `${digits}${'0'.repeat(point - digits.length)}`
        : digits;
  const at = Math.max(point, 0);
  const left = padded.slice(0, at).replace(/^0+(?=\d)/, '') || '0';
  const right = padded.slice(at).replace(/0+$/, '');
  return right === '' ? left : `${left}.${right}`;
}

/** A fraction as the percentage it is: `0.1` is `10`. */
export function percentOf(fraction: string): string {
  return fraction.trim() === '' ? '' : shifted(fraction, 2);
}

/** A percentage as the fraction it is: `10` is `0.1`. */
export function fractionOf(percent: string): string {
  return percent.trim() === '' ? '' : shifted(percent, -2);
}
