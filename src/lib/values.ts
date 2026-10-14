import type { ValueMeaning } from '@/api/types';

/**
 * How a page names a value a workflow reports (M58): its title and the unit
 * it is counted in, each null where the workflow gives none, as a result's
 * meanings, a publication's and a leaderboard's way to rank carry them.
 */
export type ValueWords = { title: string | null; unit: string | null };

/** A reported value as a page names it: its title, "Run time", or its key until it has one. */
export function valueTitle(name: string, words?: ValueWords | null): string {
  return words?.title ?? name;
}

/**
 * A value's title inside a sentence, "run time": its first letter lowered
 * only where a lower-case letter follows it, so an abbreviation such as
 * "CPU" or "R2" keeps its own, as the forge's sentences do; a value with no
 * title goes by its key.
 */
export function titleInSentence(name: string, words?: ValueWords | null): string {
  const title = valueTitle(name, words);
  if (title === name) return title;
  const [first = '', second = ''] = title;
  return second !== second.toUpperCase()
    ? `${first.toLowerCase()}${title.slice(1)}`
    : title;
}

/** A number as read, with its value's unit after it: "28 ms"; alone where there is none. */
export function withUnit(number: string, words?: ValueWords | null): string {
  const unit = words?.unit ?? null;
  return unit === null || unit === '' ? number : `${number} ${unit}`;
}

/** The meaning of the value `name` among `meanings`, if they hold one. */
export function meaningOf(
  meanings: readonly ValueMeaning[] | undefined,
  name: string,
): ValueMeaning | undefined {
  return meanings?.find((meaning) => meaning.name === name);
}

/**
 * `names` in the workflow's report order, as `meanings` give it; a name the
 * meanings do not hold keeps its place after them, in the order given.
 */
export function inReportOrder(
  names: readonly string[],
  meanings: readonly ValueMeaning[] | undefined,
): string[] {
  const order = (meanings ?? []).map((meaning) => meaning.name);
  const rank = (name: string) => {
    const at = order.indexOf(name);
    return at < 0 ? order.length : at;
  };
  return [...names].sort((a, b) => rank(a) - rank(b));
}

/**
 * Which way a value ranks, from which way is better: "lowest first" where
 * lower is better, as with run time; "best first" where that is not known.
 */
export function valueFirst(words: { better: string | null } | undefined): string {
  if (words?.better === 'lower') return 'lowest first';
  if (words?.better === 'higher') return 'highest first';
  return 'best first';
}

/**
 * How a leaderboard combines a value across each task's tests, in a word:
 * "highest" for the highest test, "total" for the sum, "average" for the
 * mean. Null for anything else, such as a key that is not a value.
 */
export function foldWord(fold: string | null | undefined): string | null {
  if (fold === 'max') return 'highest';
  if (fold === 'sum') return 'total';
  if (fold === 'mean') return 'average';
  return null;
}
