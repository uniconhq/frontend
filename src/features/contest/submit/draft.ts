import { ApiError } from '@/api/problem';
import type { InputField, SubmittedInput } from '@/api/types';
import { compareDecimal } from '@/lib/exact';

/**
 * What the panel holds for one field: the files of a file or folder input;
 * the text of a text or number input as typed; whether a true-or-false
 * input is ticked; or the option chosen of an enum input.
 */
export type OneEntry =
  | { kind: 'files'; files: File[] }
  | { kind: 'text'; text: string }
  | { kind: 'flag'; checked: boolean }
  | { kind: 'choice'; option: string };

/**
 * What the panel holds for one input: one field, or, for an input given
 * once per row, one field of the input's own kind for each part.
 */
export type Entry = OneEntry | { kind: 'parts'; parts: OneEntry[] };

/**
 * One file about to be uploaded, and the part it belongs to when the input
 * is given once per row. Parts are numbered from 1, as the slot asks.
 */
export type UploadFile = {
  input: InputField;
  file: File;
  part: number | null;
};

/** The parts of an input given once per row, or none when it is one field. */
export function partsOf(input: InputField): NonNullable<InputField['parts']> | null {
  const parts = input.parts;
  return Array.isArray(parts) && parts.length > 0 ? parts : null;
}

/** What an upload box is called: the row's title, or "Part 1", "Part 2". */
export function partTitle(title: string | null | undefined, index: number): string {
  return title !== null && title !== undefined && title !== ''
    ? title
    : `Part ${String(index + 1)}`;
}

/** Everything in the panel, by input id. Replaced whole on every change. */
export type Draft = Readonly<Record<string, Entry>>;

/** The most a text input takes, in bytes of UTF-8, as forge counts it. */
const TEXT_MAX = 64 * 1024;

/** A number as a contestant gives it: plain decimal digits, as the forge takes one. */
const PLAIN_DECIMAL = /^-?[0-9]+(\.[0-9]+)?$/;

function takesFiles(input: InputField): boolean {
  return input.type === 'file' || input.type === 'folder';
}

/** Whether the input takes several files that keep where they sit: a folder. */
export function takesPaths(input: InputField): boolean {
  return input.type === 'folder';
}

/**
 * Where a file goes under its input. A file of a folder input keeps its path
 * inside the folder it was chosen from, the folder's own name left off; a
 * file chosen alone, and the one file of a file input, goes by its name.
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

/** An input as the panel starts it: no files, or the input's default, in each part it has. */
function emptyEntry(input: InputField): Entry {
  const parts = partsOf(input);
  return parts === null
    ? emptyOne(input)
    : { kind: 'parts', parts: parts.map(() => emptyOne(input)) };
}

function emptyOne(input: InputField): OneEntry {
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
  if (entry === undefined || entry.kind !== empty.kind) return empty;
  if (entry.kind === 'parts' && empty.kind === 'parts') {
    return {
      kind: 'parts',
      parts: empty.parts.map((slot, index) => {
        const kept = entry.parts[index];
        return kept !== undefined && kept.kind === slot.kind ? kept : slot;
      }),
    };
  }
  return entry;
}

/**
 * Whether a part is given: a file chosen, a text or a number typed, an
 * option chosen; a true-or-false part always is. A part not given is left
 * out of the submit, and the runs of its row are skipped.
 */
function partGiven(input: InputField, entry: OneEntry): boolean {
  switch (entry.kind) {
    case 'files':
      return entry.files.length > 0;
    case 'flag':
      return true;
    case 'choice':
      return entry.option !== '';
    case 'text':
      return input.type === 'number' ? entry.text.trim() !== '' : entry.text !== '';
  }
}

/** Every file the draft will upload, with the part a per-row input names. */
export function uploadsOf(inputs: InputField[], draft: Draft): UploadFile[] {
  const found: UploadFile[] = [];
  for (const input of inputs) {
    if (!takesFiles(input)) continue;
    const entry = entryOf(draft, input);
    if (entry.kind === 'parts') {
      entry.parts.forEach((part, index) => {
        if (part.kind !== 'files') return;
        for (const file of part.files) found.push({ input, file, part: index + 1 });
      });
    } else if (entry.kind === 'files') {
      for (const file of entry.files) found.push({ input, file, part: null });
    }
  }
  return found;
}

type Problem = { input: string; message: string };

/** What is wrong with one input's entry, as forge would word it, if anything. */
function problemOf(input: InputField, entry: Entry): string | null {
  if (entry.kind !== 'parts') return oneProblem(input, entry);
  const titles = partsOf(input) ?? [];
  let given = false;
  for (const [index, part] of entry.parts.entries()) {
    if (!partGiven(input, part)) continue;
    given = true;
    const problem = oneProblem(input, part);
    if (problem !== null) {
      return `${partTitle(titles[index]?.title, index)}: ${problem}`;
    }
  }
  return given ? null : 'Give at least one part of this input.';
}

function oneProblem(input: InputField, entry: OneEntry): string | null {
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
      ? `This must be at most ${TEXT_MAX} bytes.`
      : null;
  }
  const trimmed = entry.text.trim();
  if (!PLAIN_DECIMAL.test(trimmed))
    return 'Give a number in plain digits, such as 2.5.';
  if (input.min !== null && compareDecimal(trimmed, input.min) < 0)
    return `This must be at least ${input.min}.`;
  if (input.max !== null && compareDecimal(trimmed, input.max) > 0)
    return `This must be at most ${input.max}.`;
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
    const entry = entryOf(draft, input);
    if (entry.kind === 'parts') {
      const parts = partsOf(input) ?? [];
      for (let index = 0; index < parts.length; index += 1) {
        const given = entry.parts[index];
        const part = parts[index];
        if (given?.kind !== 'files' || part === undefined) continue;
        const total = given.files.reduce((sum, file) => sum + file.size, 0);
        if (total > part.max_size) {
          return new ApiError({
            code: 'too_large',
            status: 0,
            title: 'Too large for this input',
            extensions: { limit: part.max_size, input: input.id, part: index + 1 },
          });
        }
      }
      continue;
    }
    if (entry.kind !== 'files') continue;
    const total = entry.files.reduce((sum, file) => sum + file.size, 0);
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
 * value, a number as the digits it was typed as, the form the API serves
 * every number in, so none is read into a float on the way. `uploadOf` is the upload each file went up as for the input it was
 * sent for.
 */
export function submittedInputs(
  inputs: InputField[],
  draft: Draft,
  uploadOf: (input: string, file: File) => string,
): Record<string, SubmittedInput> {
  const one = (input: InputField, entry: OneEntry): SubmittedInput => {
    switch (entry.kind) {
      case 'files':
        return { uploads: entry.files.map((file) => uploadOf(input.id, file)) };
      case 'flag':
        return { uploads: [], value: entry.checked };
      case 'choice':
        return { uploads: [], value: entry.option };
      case 'text':
        return {
          uploads: [],
          value: input.type === 'number' ? entry.text.trim() : entry.text,
        };
    }
  };
  return Object.fromEntries(
    inputs.map((input): [string, SubmittedInput] => {
      const entry = entryOf(draft, input);
      if (entry.kind !== 'parts') return [input.id, one(input, entry)];
      return [
        input.id,
        {
          uploads: [],
          // A part not given is left out, as the forge reads it.
          parts: Object.fromEntries(
            entry.parts.flatMap((part, index) =>
              partGiven(input, part) ? [[String(index + 1), one(input, part)]] : [],
            ),
          ),
        },
      ];
    }),
  );
}
