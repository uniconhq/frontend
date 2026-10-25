import type { DeclaredField } from '@/api/types';

/**
 * Many tests at once, from files paired by name or from a zip's folders: each
 * file is matched to a test and to the field of the test it fills, so the
 * organiser sees what was matched, and what was not and why, before anything
 * is saved. A test's files are named by the format (TASK-FORMAT 1.2): a field
 * `input` is a file `input` or `input.txt`, the name up to its first dot
 * being the field.
 */

/** A file to add, from the disk or from a zip: its name or path, its size, its bytes. */
export type Source = { path: string; size: number; read: () => Promise<Blob> };

/** One file of a test: the field it fills, and its name in the test's folder. */
export type TestFile = { field: string; entry: string; source: Source };

/** A test the files make: its group when they say it, its name, and its files. */
type MatchedTest = {
  group: string | null;
  test: string;
  files: TestFile[];
  /** What is wrong with it, such as a field no file fills; empty when it is complete. */
  problems: string[];
};

export type Matched = {
  tests: MatchedTest[];
  unmatched: { path: string; reason: string }[];
};

/** A group's or a test's name, as the format takes them: letters, digits, `_` and `-`. */
const NAME = /^[A-Za-z0-9_-]+$/;

/**
 * Endings tests are commonly given, each with the fields it may stand for,
 * in order: `1.in` is the `input`, `1.out` the `answer`, or the `output`
 * where a workflow names it so.
 */
const ALIASES: Record<string, string[]> = {
  in: ['input'],
  inp: ['input'],
  out: ['answer', 'output', 'expected'],
  ans: ['answer', 'expected'],
  a: ['answer'],
  expected: ['answer', 'expected'],
};

/** The field an ending names, among the workflow's file and folder fields. */
function fieldOf(ending: string, fields: DeclaredField[]): DeclaredField | undefined {
  const exact = fields.find((field) => field.name === ending);
  if (exact !== undefined) return exact;
  for (const name of ALIASES[ending.toLowerCase()] ?? []) {
    const found = fields.find((field) => field.name === name);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Why a file is left out before it is matched, or null: one whose path leads
 * out of its folder, or a hidden one the zip or the disk adds, which is no
 * one's test.
 */
function leftOut(path: string): string | null {
  const parts = path.split('/');
  if (parts.some((part) => part === '..')) {
    return 'Its path leads out of its folder, so it is left out.';
  }
  return parts.some((part) => part.startsWith('.'))
    ? 'It is a hidden file, so it is left out.'
    : null;
}

type Placed = { group: string | null; test: string; field: string; entry: string };

/**
 * Where one file goes, from its path: `1.in` alone, `small/1.in`, a test's
 * folder `1/input`, `small/1/input`, a folder field's file `1/data/a.csv`,
 * any of them under a folder named `tests`. A string is why it goes nowhere.
 */
function place(path: string, files: DeclaredField[]): Placed | string {
  const parts = path.split('/').filter((part) => part !== '');
  const tests = parts.lastIndexOf('tests');
  const rest = tests >= 0 ? parts.slice(tests + 1) : parts;
  const fileFields = files.filter((field) => field.type === 'file');
  const folderFields = files.filter((field) => field.type === 'folder');
  const folderAt = rest.findIndex(
    (part, at) => at > 0 && folderFields.some((field) => field.name === part),
  );

  // A folder field's file: <group>/<test>/<field>/... or <test>/<field>/...
  if (folderAt === 1 || folderAt === 2) {
    const test = rest[folderAt - 1] ?? '';
    const group = folderAt === 2 ? (rest[0] ?? null) : null;
    const field = rest[folderAt] ?? '';
    return { group, test, field, entry: rest.slice(folderAt).join('/') };
  }
  const name = rest.at(-1) ?? '';
  const dot = name.indexOf('.');
  const head = dot < 0 ? name : name.slice(0, dot);
  const tail = dot < 0 ? '' : name.slice(dot + 1);

  // A test's own folder: <test>/<field>[.ending], or under its group.
  const inFolder = rest.length >= 2 ? fieldOf(head, fileFields) : undefined;
  if (inFolder !== undefined && rest.length <= 3) {
    return {
      group: rest.length === 3 ? (rest[0] ?? null) : null,
      test: rest.at(-2) ?? '',
      field: inFolder.name,
      entry: name.replace(head, inFolder.name),
    };
  }
  if (head === 'test' && tail === 'yaml' && rest.length >= 2 && rest.length <= 3) {
    return {
      group: rest.length === 3 ? (rest[0] ?? null) : null,
      test: rest.at(-2) ?? '',
      field: 'test.yaml',
      entry: 'test.yaml',
    };
  }

  // A file named for its test: <test>.<ending>, alone or in its group's folder.
  if (rest.length > 2) return 'It is in a folder that is not a test group or a test.';
  if (tail === '') return 'Its name has no ending saying which part of a test it is.';
  const [ending = '', ...more] = tail.split('.');
  const field = fieldOf(ending, fileFields);
  if (field === undefined) {
    return `Its ending “.${ending}” names no part of a test: a test has ${fileFields
      .map((each) => each.name)
      .join(', ')}.`;
  }
  return {
    group: rest.length === 2 ? (rest[0] ?? null) : null,
    test: head,
    field: field.name,
    entry: [field.name, ...more].join('.'),
  };
}

/**
 * The tests the files make. Every file and folder field must be filled once,
 * a test's values coming from its `test.yaml` or from the form; a file that
 * fits no test is listed with the reason.
 */
export function matchFiles(sources: Source[], fields: DeclaredField[]): Matched {
  const fileFields = fields.filter(
    (field) => field.type === 'file' || field.type === 'folder',
  );
  const tests = new Map<string, MatchedTest>();
  const unmatched: Matched['unmatched'] = [];
  for (const source of sources) {
    const out = leftOut(source.path);
    if (out !== null) {
      unmatched.push({ path: source.path, reason: out });
      continue;
    }
    const found = place(source.path, fileFields);
    if (typeof found === 'string') {
      unmatched.push({ path: source.path, reason: found });
      continue;
    }
    if (!NAME.test(found.test) || (found.group !== null && !NAME.test(found.group))) {
      unmatched.push({
        path: source.path,
        reason: 'A test’s and a group’s name may hold only letters, digits, _ and -.',
      });
      continue;
    }
    const key = `${found.group ?? ''}/${found.test}`;
    const test = tests.get(key) ?? {
      group: found.group,
      test: found.test,
      files: [],
      problems: [],
    };
    test.files.push({ field: found.field, entry: found.entry, source });
    tests.set(key, test);
  }
  for (const test of tests.values()) {
    const entries = test.files.map((file) => file.entry);
    for (const entry of new Set(entries)) {
      const times = entries.filter((each) => each === entry).length;
      if (times > 1) test.problems.push(`It has ${String(times)} files at ${entry}.`);
    }
    for (const field of fileFields) {
      const given = test.files.filter((file) => file.field === field.name);
      if (given.length === 0) test.problems.push(`It has no ${field.name}.`);
      else if (field.type === 'file' && given.length > 1) {
        test.problems.push(`It has ${String(given.length)} files for ${field.name}.`);
      }
    }
  }
  return {
    tests: [...tests.values()].sort(
      (a, b) =>
        (a.group ?? '').localeCompare(b.group ?? '', undefined, { numeric: true }) ||
        a.test.localeCompare(b.test, undefined, { numeric: true }),
    ),
    unmatched,
  };
}
