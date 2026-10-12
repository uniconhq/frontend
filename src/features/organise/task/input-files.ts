import type { DeclaredInput } from '@/api/types';
import { formatSize } from '@/lib/size';
import { tokenNow } from '../files/use-task-upload';
import type { TaskPlace } from './build-data';
import type { Source } from './match';
import { filesUnder, type PlannedChange } from './staged';

/**
 * A file or a folder chosen for a setting of the task on the Inputs card
 * (M51), waiting for the one save of the task: the files written under the
 * input's own folder (`ownFolder`), and what the setting then names; the
 * file or files it named before, when they were under that folder too, are
 * taken out, so a replaced checker leaves nothing behind. Files elsewhere in
 * the task are left as they are.
 */
export type StagedInput = {
  id: string;
  /** What the setting names once saved: the file's path, or the folder's, ending in `/`. */
  value: string;
  /** The value it had, which Undo puts back. */
  was: string;
  planned: PlannedChange[];
  /** The files chosen, in words: "checker.py, 2 KB" or "3 files, 12 KB". */
  summary: string;
};

/**
 * The folders of a task the format gives a meaning of its own (TASK-FORMAT
 * 1.2), which the forge refuses as an input's id when a workflow version is
 * made or checked.
 */
const RESERVED_FOLDERS = new Set(['tests', 'public', 'plans']);

/**
 * The folder a setting's own files go in: `<input>/`, or `inputs/<input>/`
 * for an input of a version made before the forge refused an id that is a
 * reserved folder, so its files never mix with the tests, the files every
 * contestant is served, or the plan.
 */
function ownFolder(id: string): string {
  return RESERVED_FOLDERS.has(id) ? `inputs/${id}` : id;
}

/** A file chosen on the disk as a source of the save. */
function sourceOf(file: File): Source {
  return { path: file.name, size: file.size, read: () => Promise.resolve(file) };
}

/** A folder's file by its path inside the folder chosen: `data/a.csv` is `a.csv`. */
function insideFolder(file: File): string {
  const path = file.webkitRelativePath === '' ? file.name : file.webkitRelativePath;
  const parts = path.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : path;
}

/**
 * The files chosen for an input as one change of the save: each written at
 * `<own folder>/<name>`, with the token of a file already there, and what the
 * setting named before taken out when it was under that folder and is not
 * written over.
 */
export async function stageInputFiles(
  place: TaskPlace,
  declared: DeclaredInput,
  files: File[],
  was: string,
): Promise<StagedInput> {
  const id = declared.id;
  const home = ownFolder(id);
  const folder = declared.type === 'folder';
  const chosen = files.map((file) => ({
    path: `${home}/${folder ? insideFolder(file) : file.name}`,
    source: sourceOf(file),
  }));
  const value = folder ? `${home}/` : (chosen[0]?.path ?? '');
  const own = was.startsWith(`${home}/`);
  const before = !own
    ? []
    : was.endsWith('/')
      ? await filesUnder(place, was.slice(0, -1))
      : await (async () => {
          const token = await tokenNow(place, was);
          return token === null ? [] : [{ path: was, token, size: null }];
        })();
  const planned: PlannedChange[] = [];
  for (const file of chosen) {
    const known = before.find((old) => old.path === file.path);
    planned.push({
      path: file.path,
      token: known?.token ?? (await tokenNow(place, file.path)),
      source: file.source,
    });
  }
  for (const old of before) {
    if (!chosen.some((file) => file.path === old.path)) {
      planned.push({ path: old.path, token: old.token, remove: true });
    }
  }
  const size = files.reduce((sum, file) => sum + file.size, 0);
  return {
    id,
    value,
    was,
    planned,
    summary:
      files.length === 1 && !folder
        ? `${files[0]?.name ?? ''}, ${formatSize(size)}`
        : `${String(files.length)} ${files.length === 1 ? 'file' : 'files'}, ${formatSize(size)}`,
  };
}
