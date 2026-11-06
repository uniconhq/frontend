/** The forge only accepts `v` and a whole number from 1. An older tag under another name is still read, and has no number. */
const NUMBERED = /^v([1-9][0-9]*)$/;

export function versionNumber(version: string): number | null {
  const found = NUMBERED.exec(version);
  return found?.[1] === undefined ? null : Number(found[1]);
}

/** The highest number, or the last listed when none has one. A name of another kind may come after every number. */
export function latestVersion(versions: readonly string[]): string | undefined {
  let latest: string | undefined;
  let highest = 0;
  for (const version of versions) {
    const number = versionNumber(version);
    if (number !== null && number > highest) {
      latest = version;
      highest = number;
    }
  }
  return latest ?? versions.at(-1);
}

export function nextVersion(versions: readonly string[]): string {
  const numbers = versions
    .map(versionNumber)
    .filter((number): number is number => number !== null);
  return `v${String(Math.max(0, ...numbers) + 1)}`;
}
