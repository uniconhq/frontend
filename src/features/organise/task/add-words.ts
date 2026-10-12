import type { PartNaming } from './match';

/**
 * What the Add tests dialog says of a test's parts, from the task's own
 * workflow (M47), so the words fit the task in front of the organiser: what
 * each way of adding asks for, and how files are named for it.
 */

/** "a" or "an", as a part's name begins. */
function article(name: string): string {
  return /^[aeiou]/i.test(name) ? 'an' : 'a';
}

/** Words joined as a list is said: "a, b and c". */
function listed(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;
}

/** The example file of test 1 for each part named by an ending: `1.in`, `1.out`. */
function examples(parts: PartNaming[]): string[] {
  return parts.flatMap((part) => (part.ending === null ? [] : [`1.${part.ending}`]));
}

/** What each way of adding tests does, said with the task's parts. */
export function waysOf(parts: PartNaming[]): {
  one: string;
  paired: string;
  zip: string;
} {
  const named = parts.filter((part) => !part.folder);
  const files = examples(parts);
  const set = named.length === 2 ? 'pairs' : 'sets';
  const folders = parts.map((part) => `1/${part.name}`).join(', ');
  return {
    one:
      parts.length === 0
        ? 'Give its values.'
        : `Pick ${listed(parts.map((part) => `its ${part.name}`))}.`,
    paired:
      files.length === 0
        ? 'Drop files named by test. Each number becomes one test.'
        : `Drop ${set} like ${listed(files)}. Each number becomes one test.`,
    zip:
      files.length === 0 || named.length < parts.length
        ? `A folder per test in a zip (${folders}).`
        : `The same ${set} in a zip, or a folder per test (${folders}).`,
  };
}

/**
 * Why files dropped by name cannot make the task's tests, or null when they
 * can: a part that is a folder comes only in a zip's folders.
 */
export function pairedRefusal(parts: PartNaming[]): string | null {
  const folders = parts.filter((part) => part.folder).map((part) => part.name);
  if (folders.length === 0) return null;
  return `A test's ${listed(folders)} ${folders.length === 1 ? 'is a folder' : 'are folders'}, which only a zip can hold.`;
}

/**
 * How files dropped by name are named for the task's parts: "Each test needs
 * an input and an answer. Name them like 1.in (test 1's input) and 1.out
 * (test 1's answer). Also taken: .inp, .input; .ans, .answer."
 */
export function namingSentences(parts: PartNaming[]): string[] {
  if (parts.length === 0) return ['A test of this task has no files.'];
  const named = parts.filter(
    (part): part is PartNaming & { ending: string } => part.ending !== null,
  );
  const needs = `Each test needs ${listed(
    parts.map(
      (part) => `${article(part.name)} ${part.name}${part.folder ? ' folder' : ''}`,
    ),
  )}.`;
  if (named.length === 0) return [needs];
  const like = `Name them like ${listed(
    named.map((part) => `1.${part.ending} (test 1's ${part.name})`),
  )}.`;
  const also = named.filter((part) => part.also.length > 0);
  return [
    needs,
    like,
    ...(also.length === 0
      ? []
      : [
          `Also taken: ${also
            .map((part) => part.also.map((ending) => `.${ending}`).join(', '))
            .join('; ')}.`,
        ]),
  ];
}
