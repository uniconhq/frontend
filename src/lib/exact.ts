// The API sends numbers as decimal strings so no float loses digits; they are
// rounded only here, for display.

const DECIMAL = /^([-+]?)(\d*)(?:\.(\d*))?(?:[eE]([-+]?\d+))?$/;
/** Hex or octal, as YAML 1.2's core schema writes one. */
const BASED = /^0x[0-9a-fA-F]+$|^0o[0-7]+$/;
/** A cap so a huge exponent cannot take ages to build; no real number nears it. */
const MOST_POWER = 1000;

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

/** Compares exactly, whatever the spelling (`2.50`, `25e-1`, `0x19`); NaN for non-numbers. */
export function compareDecimal(a: string, b: string): number {
  const left = scaled(a);
  const right = scaled(b);
  if (left === null || right === null) return Number.NaN;
  const power = Math.min(left.power, right.power);
  const x = left.units * 10n ** BigInt(left.power - power);
  const y = right.units * 10n ** BigInt(right.power - power);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** `den` is above zero. */
export type Ratio = { num: bigint; den: bigint };

/** Rounds half away from zero, or cuts toward zero: `200/3` is `66.67` or `66.66`. */
export function ratioDigits(
  value: Ratio,
  decimals = 2,
  how: 'round' | 'cut' = 'round',
): { digits: string; exact: boolean } {
  const negative = value.num < 0n;
  const num = negative ? -value.num : value.num;
  const scale = 10n ** BigInt(decimals);
  const whole = (num * scale) / value.den;
  const left = (num * scale) % value.den;
  const units = how === 'round' && 2n * left >= value.den ? whole + 1n : whole;
  const text = units.toString().padStart(decimals + 1, '0');
  const digits =
    decimals === 0 ? text : `${text.slice(0, -decimals)}.${text.slice(-decimals)}`;
  const kept = rounded(digits, decimals);
  return {
    digits: negative && units !== 0n ? `-${kept}` : kept,
    exact: left === 0n,
  };
}

type Parts = { negative: boolean; whole: string; fraction: string };

function partsOf(exact: string): Parts {
  const negative = exact.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? exact.slice(1) : exact).split('.');
  return { negative, whole, fraction };
}

/** Half away from zero, trailing zeros dropped: `"2.675"` to 2 is `"2.68"`. */
export function rounded(exact: string, decimals: number): string {
  const { negative, whole, fraction } = partsOf(exact);
  if (fraction.length <= decimals) {
    const kept = fraction.replace(/0+$/, '');
    const digits = kept === '' ? whole : `${whole}.${kept}`;
    return negative && digits.replace(/[0.]/g, '') !== '' ? `-${digits}` : digits;
  }
  const scaled = BigInt(whole + fraction.slice(0, decimals));
  const up = Number(fraction[decimals]) >= 5 ? 1n : 0n;
  const digits = (scaled + up).toString().padStart(decimals + 1, '0');
  const cut =
    decimals === 0
      ? digits
      : `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
  return rounded(negative ? `-${cut}` : cut, decimals);
}

const locale = new Intl.NumberFormat();
const decimalSign =
  locale.formatToParts(0.5).find((part) => part.type === 'decimal')?.value ?? '.';

/** In the reader's locale, grouped as a BigInt so a number past a float shows whole. */
export function formatExact(exact: string, decimals = 4): string {
  const { negative, whole, fraction } = partsOf(rounded(exact, decimals));
  const grouped = locale.format(BigInt(whole));
  const digits = fraction === '' ? grouped : `${grouped}${decimalSign}${fraction}`;
  return negative ? `-${digits}` : digits;
}
