import { apiClient } from '@/api/client';
import { toApiError } from '@/api/problem';
import type { DeclaredField, SaveChange } from '@/api/types';
import { tokenNow } from '../files/use-task-upload';
import { parseYaml, numberText, writeAt, writeYaml } from '../forms/yaml-doc';
import type { TaskPlace } from './build-data';
import { partOf } from './parts';
import type { Source, TestFile } from './match';

/**
 * Changes to the task's tests that wait for the one save of the task: tests
 * added or replaced, with their files and values, and tests taken out. Each
 * test that is there already carries its files as they were when the change
 * was made, with the token each was read with, so a file someone else changed
 * since is a conflict at the save, not overwritten unseen.
 */

/** A file of a test as it was when a change to the test was made. */
export type Existing = { path: string; token: string; size: number | null };

export type StagedTest = {
  group: string;
  test: string;
  files: TestFile[];
  /**
   * The test's values (its `test.yaml`), by field, when this change gives
   * them; null leaves the values as they are.
   */
  values: Record<string, string> | null;
  /** Its files as they were, none for a new test. */
  existing: Existing[];
};

type StagedRemoval = { group: string; test: string; existing: Existing[] };

export type Staged = { tests: StagedTest[]; removals: StagedRemoval[] };

export const NOTHING_STAGED: Staged = { tests: [], removals: [] };

const TREE = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/tree';

/** Every file under a folder of the task, each with its token, read now. */
async function filesUnder(place: TaskPlace, folder: string): Promise<Existing[]> {
  const path = { org: place.org, contest: place.contest, task: place.task };
  let entries;
  try {
    const { data } = await apiClient.GET(TREE, {
      params: { path, query: { path: folder } },
    });
    entries = data ?? [];
  } catch (error) {
    if (toApiError(error).code === 'not_found') return [];
    throw error;
  }
  const found = await Promise.all(
    entries.map(async (entry): Promise<Existing[]> => {
      if (entry.kind === 'directory') return filesUnder(place, entry.path);
      const token = await tokenNow(place, entry.path);
      return token === null ? [] : [{ path: entry.path, token, size: entry.size }];
    }),
  );
  return found.flat();
}

/** A test's folder in the task. */
export function testFolder(group: string, test: string): string {
  return `tests/${group}/${test}`;
}

/** A test's files as they are now, each with its token: what a change to it is made over. */
export function existingOf(place: TaskPlace, group: string, test: string) {
  return filesUnder(place, testFolder(group, test));
}

/** The field a file of a test fills, by its path in the test's folder: `answer.txt` fills `answer`. */
function fieldOfEntry(entry: string): string {
  return entry.split('/')[0] === 'test.yaml' ? 'test.yaml' : partOf(entry);
}

/** A test's values as its `test.yaml`, each written as its field's type. */
function testYaml(values: Record<string, string>, fields: DeclaredField[]): string {
  const parsed = parseYaml('{}\n');
  if ('error' in parsed) return '';
  const { doc } = parsed;
  for (const field of fields) {
    const text = values[field.name] ?? '';
    if (text.trim() === '') continue;
    const value =
      field.type === 'number'
        ? numberText(text)
        : field.type === 'boolean'
          ? text.trim() === 'true'
          : text;
    writeAt(doc, [field.name], value);
  }
  return writeYaml(doc);
}

/** One file the save writes: typed text, or a file's bytes; or one it removes. */
export type PlannedChange =
  | { path: string; token: string | null; text: string }
  | { path: string; token: string | null; source: Source }
  | { path: string; token: string; remove: true };

/**
 * What the save writes and removes for the staged tests. A test's file is
 * written with the token its path had when the change was made, none for a
 * new one; a file of a replaced field that the new files do not write over
 * is removed, so a field never has two files; a test taken out loses every
 * file it had.
 */
export function plannedChanges(
  staged: Staged,
  fields: DeclaredField[],
): PlannedChange[] {
  const planned: PlannedChange[] = [];
  for (const test of staged.tests) {
    const folder = testFolder(test.group, test.test);
    const tokenOf = (path: string) =>
      test.existing.find((file) => file.path === path)?.token ?? null;
    const written = new Set<string>();
    for (const file of test.files) {
      const path = `${folder}/${file.entry}`;
      written.add(path);
      planned.push({ path, token: tokenOf(path), source: file.source });
    }
    const replaced = new Set(test.files.map((file) => file.field));
    if (test.values !== null) {
      const path = `${folder}/test.yaml`;
      const valueFields = fields.filter(
        (field) => field.type !== 'file' && field.type !== 'folder',
      );
      if (valueFields.length > 0) {
        written.add(path);
        planned.push({
          path,
          token: tokenOf(path),
          text: testYaml(test.values, valueFields),
        });
      }
      replaced.add('test.yaml');
    }
    for (const file of test.existing) {
      const entry = file.path.slice(folder.length + 1);
      if (!written.has(file.path) && replaced.has(fieldOfEntry(entry))) {
        planned.push({ path: file.path, token: file.token, remove: true });
      }
    }
  }
  for (const removal of staged.removals) {
    for (const file of removal.existing) {
      planned.push({ path: file.path, token: file.token, remove: true });
    }
  }
  return planned;
}

/** A file's bytes as base64, the way a save carries a file that is not text. */
async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

/** The most a file may be to go inside the save itself, and the most all of them may be. */
const INLINE_FILE = 256 * 1024;
const INLINE_TOTAL = 4 * 1024 * 1024;

/**
 * The planned changes as the save's changes: text as it is, a small file's
 * bytes inside the save, a larger one by the upload `upload` gives for it,
 * and a removal by its token.
 */
export async function fileChanges(
  planned: PlannedChange[],
  upload: (path: string, source: Source) => Promise<string>,
): Promise<SaveChange[]> {
  let inline = 0;
  const changes: SaveChange[] = [];
  for (const change of planned) {
    if ('remove' in change) {
      changes.push({
        path: change.path,
        token: change.token,
        remove: true,
        encoding: 'utf-8',
      });
    } else if ('text' in change) {
      changes.push({
        path: change.path,
        token: change.token,
        content: change.text,
        encoding: 'utf-8',
        remove: false,
      });
    } else if (
      change.source.size <= INLINE_FILE &&
      inline + change.source.size <= INLINE_TOTAL
    ) {
      inline += change.source.size;
      changes.push({
        path: change.path,
        token: change.token,
        content: await base64Of(await change.source.read()),
        encoding: 'base64',
        remove: false,
      });
    } else {
      changes.push({
        path: change.path,
        token: change.token,
        upload: await upload(change.path, change.source),
        encoding: 'utf-8',
        remove: false,
      });
    }
  }
  return changes;
}
