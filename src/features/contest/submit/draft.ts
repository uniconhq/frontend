import { ApiError } from '@/api/problem';
import type { ContestantInput, SubmittedInput } from '@/api/types';

/**
 * What the panel holds for one input before it is sent: the files of a code,
 * file or file[] input, with a code input's language; the text of a text or
 * number input as typed; or whether a true-or-false input is ticked.
 */
export type Entry =
  | { kind: 'files'; files: File[]; language: string }
  | { kind: 'text'; text: string }
  | { kind: 'flag'; checked: boolean };

/** Everything in the panel, by input id. Replaced whole on every change. */
export type Draft = Readonly<Record<string, Entry>>;

type PanelType = 'code' | 'file' | 'file[]' | 'text' | 'number' | 'boolean';

/** An input the panel shows a field for. */
export type PanelInput = ContestantInput & { type: PanelType };

const PANEL_TYPES = new Set<string>([
  'code',
  'file',
  'file[]',
  'text',
  'number',
  'boolean',
]);
const FILE_TYPES = new Set<string>(['code', 'file', 'file[]']);

/** The most a text input takes, in bytes of UTF-8, as forge counts it. */
const TEXT_MAX = 64 * 1024;

export function isPanelInput(input: ContestantInput): input is PanelInput {
  return PANEL_TYPES.has(input.type);
}

export function takesFiles(input: ContestantInput): boolean {
  return FILE_TYPES.has(input.type);
}

/** The language a code input starts with: its only one, or none chosen yet. */
function firstLanguage(input: ContestantInput): string {
  return input.language?.length === 1 ? (input.language[0] ?? '') : '';
}

/** An input as the panel starts it: no files, or the input's default. */
function emptyEntry(input: PanelInput): Entry {
  switch (input.type) {
    case 'code':
    case 'file':
    case 'file[]':
      return { kind: 'files', files: [], language: firstLanguage(input) };
    case 'boolean':
      return { kind: 'flag', checked: input.default === true };
    case 'text':
    case 'number':
      return {
        kind: 'text',
        text: input.default === null ? '' : String(input.default),
      };
  }
}

export function emptyDraft(inputs: PanelInput[]): Draft {
  return Object.fromEntries(inputs.map((input) => [input.id, emptyEntry(input)]));
}

/** The entry for `input`, or its empty one when the draft has none of the right kind. */
export function entryOf(draft: Draft, input: PanelInput): Entry {
  const entry = draft[input.id];
  const empty = emptyEntry(input);
  return entry !== undefined && entry.kind === empty.kind ? entry : empty;
}

export function filesOf(draft: Draft, input: PanelInput): File[] {
  const entry = entryOf(draft, input);
  return entry.kind === 'files' ? entry.files : [];
}

/**
 * The input's `accept` as the file input's attribute: a bare ending such as
 * `py` is written `.py` there, as forge reads it.
 */
export function htmlAccept(input: ContestantInput): string | undefined {
  if (input.accept === null) return undefined;
  return input.accept
    .map((entry) => entry.trim())
    .map((entry) =>
      entry.startsWith('.') || entry.includes('/') ? entry : `.${entry}`,
    )
    .join(',');
}

/**
 * Whether the input takes a file of that name and content type, by the rule
 * forge checks a slot against: an entry starting with a dot, or a bare word,
 * is an ending of the name, ignoring case; one with a slash a content type,
 * where `image/*` takes every image. A code input takes any file.
 */
function accepts(input: ContestantInput, file: File): boolean {
  if (input.accept === null || input.type === 'code') return true;
  const name = file.name.toLowerCase();
  const kind = file.type.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return input.accept.some((entry) => {
    const wanted = entry.trim().toLowerCase();
    if (wanted.startsWith('.')) return name.endsWith(wanted);
    if (wanted.includes('/')) {
      return wanted.endsWith('/*')
        ? kind.startsWith(wanted.slice(0, -1))
        : kind === wanted;
    }
    return name.endsWith(`.${wanted}`);
  });
}

type Problem = { input: string; message: string };

/** What is wrong with one input's entry, as forge would word it, if anything. */
function problemOf(input: PanelInput, entry: Entry): string | null {
  if (entry.kind === 'files') {
    if (entry.files.length === 0) {
      return input.type === 'file[]'
        ? 'This input needs at least one file.'
        : 'This input needs a file.';
    }
    const refused = entry.files.find((file) => !accepts(input, file));
    if (refused !== undefined) {
      return `${refused.name} is not a file this input takes: ${(input.accept ?? []).join(', ')}.`;
    }
    const languages = input.language ?? [];
    if (
      input.type === 'code' &&
      languages.length > 0 &&
      !languages.includes(entry.language)
    ) {
      return 'Choose a language.';
    }
    return null;
  }
  if (entry.kind === 'flag') return null;
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
 * input left empty or holding a file it does not take, a language not
 * chosen or a number out of range, as `invalid_inputs`; and a file larger
 * than its input or the task takes, or files larger together than the task
 * takes, as `too_large`. The object store gives no usable error for a file
 * over its limit, so the sizes are checked here, before any upload starts.
 */
export function checkDraft(
  inputs: PanelInput[],
  draft: Draft,
  taskMaxSize: number,
): ApiError | null {
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

  let total = 0;
  for (const input of inputs) {
    const limit = Math.min(input.max_size ?? taskMaxSize, taskMaxSize);
    for (const file of filesOf(draft, input)) {
      total += file.size;
      if (file.size > limit) {
        return new ApiError({
          code: 'too_large',
          status: 0,
          title: 'That file is too large',
          extensions: { limit, input: limit < taskMaxSize ? input.id : null },
        });
      }
    }
  }
  if (total > taskMaxSize) {
    return new ApiError({
      code: 'too_large',
      status: 0,
      title: 'That submission is too large',
      extensions: { limit: taskMaxSize, input: null },
    });
  }
  return null;
}

/**
 * The submit's `inputs`: for each input, the uploads of its files and a code
 * input's language, or its value. `uploadOf` is the upload each file went up
 * as for the input it was sent for.
 */
export function submittedInputs(
  inputs: PanelInput[],
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
            {
              uploads: entry.files.map((file) => uploadOf(input.id, file)),
              language:
                input.type === 'code' && entry.language !== '' ? entry.language : null,
            },
          ];
        case 'flag':
          return [input.id, { uploads: [], value: entry.checked }];
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
