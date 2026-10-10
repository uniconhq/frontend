/**
 * A workflow version is made under `v` and a whole number from 1, with no
 * leading zero; the forge refuses any other name. A tag made before that
 * rule, under another name, is still read, and has no number.
 */
const NUMBERED = /^v([1-9][0-9]*)$/;

/** The number of a version named `v` and a whole number, or null. */
export function versionNumber(version: string): number | null {
  const found = NUMBERED.exec(version);
  return found?.[1] === undefined ? null : Number(found[1]);
}

/** The name the next version takes: the number after the highest, or `v1`. */
export function nextVersion(versions: readonly string[]): string {
  const numbers = versions
    .map(versionNumber)
    .filter((number): number is number => number !== null);
  return `v${String(Math.max(0, ...numbers) + 1)}`;
}
