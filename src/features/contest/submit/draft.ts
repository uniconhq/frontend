import { ApiError } from '@/api/problem';
import type { InputField, SubmittedInput } from '@/api/types';

/**
 * What the panel holds for one input before it is sent: the files of a file
 * or folder input; the text of a text or number input as typed; whether a
 * true-or-false input is ticked; or the option chosen of an enum input.
 */
export type Entry =
  | { kind: 'files'; files: File[] }
  | { kind: 'text'; text: string }
  | { kind: 'flag'; checked: boolean }
  | { kind: 'choice'; option: string };

/** Everything in the panel, by input id. Replaced whole on every change. */
export type Draft = Readonly<Record<string, Entry>>;

/** The most a text input takes, in bytes of UTF-8, as forge counts it. */
const TEXT_MAX = 64 * 1024;

export function takesFiles(input: InputField): boolean {
  return input.type === 'file' || input.type === 'folder';
}

/**
 * Whether the input takes several files that keep where they sit: a
 * folder, or a file per test, which is named `<group>/<test>`.
 */
export function takesPaths(input: InputField): boolean {
  return input.type === 'folder' || (input.type === 'file' && input.per_test);
}

/**
 * Where a file goes under its input. A file of a folder input, or of one
 * that takes a file per test, keeps its path inside the folder it was chosen
 * from, the folder's own name left off; a file chosen alone, and the one
 * file of a file input, goes by its name.
 */
export function pathOf(input: InputField, file: File): string {
  // A browser without folder picking gives no path at all.
  const relative: string | undefined = file.webkitRelativePath;
  if (!takesPaths(input) || relative === undefined || relative === '') {
    return file.name;
  }
  const slash = relative.indexOf('/');
  return slash === -1 ? relative : relative.slice(slash + 1);
}

/** The option an enum input starts with: its default, its only one, or none chosen yet. */
function firstOption(input: InputField): string {
  const options = input.options ?? [];
  if (typeof input.default === 'string' && options.includes(input.default)) {
    return input.default;
  }
  return options.length === 1 ? (options[0] ?? '') : '';
}

/** An input as the panel starts it: no files, or the input's default. */
function emptyEntry(input: InputField): Entry {
  switch (input.type) {
    case 'file':
    case 'folder':
      return { kind: 'files', files: [] };
    case 'boolean':
      return { kind: 'flag', checked: input.default === true };
    case 'enum':
      return { kind: 'choice', option: firstOption(input) };
    case 'text':
    case 'number':
      return {
        kind: 'text',
        text: input.default === null ? '' : String(input.default),
      };
  }
}

export function emptyDraft(inputs: InputField[]): Draft {
  return Object.fromEntries(inputs.map((input) => [input.id, emptyEntry(input)]));
}

/** The entry for `input`, or its empty one when the draft has none of the right kind. */
export function entryOf(draft: Draft, input: InputField): Entry {
  const entry = draft[input.id];
  const empty = emptyEntry(input);
  return entry !== undefined && entry.kind === empty.kind ? entry : empty;
}

export function filesOf(draft: Draft, input: InputField): File[] {
  const entry = entryOf(draft, input);
  return entry.kind === 'files' ? entry.files : [];
}

type Problem = { input: string; message: string };

/** What is wrong with one input's entry, as forge would word it, if anything. */
function problemOf(input: InputField, entry: Entry): string | null {
  switch (entry.kind) {
    case 'files':
      if (entry.files.length > 0) return null;
      return takesPaths(input)
        ? 'This input needs at least one file.'
        : 'This input needs a file.';
    case 'flag':
      return null;
    case 'choice': {
      const options = input.options ?? [];
      return options.includes(entry.option)
        ? null
        : `Choose one of ${options.join(', ')}.`;
    }
    case 'text':
      break;
  }
  if (input.type === 'text') {
    return new TextEncoder().encode(entry.text).length > TEXT_MAX
      ? `Must be at most ${TEXT_MAX} bytes.`
      : null;
  }
  const trimmed = entry.text.trim();
  if (trimmed === '') return 'Give a number.';
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return 'Must be a number.';
  if (input.min !== null && value < input.min) return `Must be at least ${input.min}.`;
  if (input.max !== null && value > input.max) return `Must be at most ${input.max}.`;
  return null;
}

/**
 * The refusals the browser can tell before anything is sent, as the same
 * errors the server would answer, so the panel says them the same way: an
 * input left empty, an option not chosen or a number out of range, as
 * `invalid_inputs`; and an input whose files together are larger than it
 * takes, as `too_large`. The object store gives no usable error for a file
 * over its limit, so the sizes are checked here, before any upload starts.
 * Whether a path is one the input takes is the server's to say.
 */
export function checkDraft(inputs: InputField[], draft: Draft): ApiError | null {
  const problems: Problem[] = [];
  for (const input of inputs) {
    const problem = problemOf(input, entryOf(draft, input));
    if (problem !== null) problems.push({ input: input.id, message: problem });
  }
  if (problems.length > 0) {
    return new ApiError({
      code: 'invalid_inputs',
      status: 0,
      title: 'The submission does not fit the task',
      extensions: { errors: problems },
    });
  }

  for (const input of inputs) {
    const total = filesOf(draft, input).reduce((sum, file) => sum + file.size, 0);
    if (total > input.max_size) {
      return new ApiError({
        code: 'too_large',
        status: 0,
        title: 'Too large for this input',
        extensions: { limit: input.max_size, input: input.id },
      });
    }
  }
  return null;
}

/**
 * The submit's `inputs`: for each input, the uploads of its files, or its
 * value. `uploadOf` is the upload each file went up as for the input it was
 * sent for.
 */
export function submittedInputs(
  inputs: InputField[],
  draft: Draft,
  uploadOf: (input: string, file: File) => string,
): Record<string, SubmittedInput> {
  return Object.fromEntries(
    inputs.map((input): [string, SubmittedInput] => {
      const entry = entryOf(draft, input);
      switch (entry.kind) {
        case 'files':
          return [
            input.id,
            { uploads: entry.files.map((file) => uploadOf(input.id, file)) },
          ];
        case 'flag':
          return [input.id, { uploads: [], value: entry.checked }];
        case 'choice':
          return [input.id, { uploads: [], value: entry.option }];
        case 'text':
          return [
            input.id,
            {
              uploads: [],
              value: input.type === 'number' ? Number(entry.text.trim()) : entry.text,
            },
          ];
      }
    }),
  );
}
