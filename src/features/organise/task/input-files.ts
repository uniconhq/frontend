import type { DeclaredInput } from '@/api/types';
import { formatSize } from '@/lib/size';
import { tokenNow } from '../files/use-task-upload';
import { lastPart, type TaskPlace } from './build-data';
import { filesUnder, type PlannedChange, type Source } from './staged';

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
 * The file or files a setting named before, with their tokens, when they
 * were under its own folder `home`; none when they were elsewhere.
 */
async function ownBefore(
  place: TaskPlace,
  home: string,
  was: string,
): Promise<{ path: string; token: string }[]> {
  if (!was.startsWith(`${home}/`)) return [];
  if (was.endsWith('/')) return filesUnder(place, was.slice(0, -1));
  const token = await tokenNow(place, was);
  return token === null ? [] : [{ path: was, token }];
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
  const before = await ownBefore(place, home, was);
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

/**
 * Whether an upload's path is one a file setting would write: a file right
 * in the setting's own folder, as a file chosen for it is saved. A folder
 * setting takes no single upload.
 */
export function uploadFits(declared: DeclaredInput, path: string): boolean {
  const home = `${ownFolder(declared.id)}/`;
  const name = path.startsWith(home) ? path.slice(home.length) : '';
  return declared.type === 'file' && name !== '' && !name.includes('/');
}

/**
 * An upload the door holds and no save has used yet, chosen for the file
 * setting it fits (`uploadFits`), as one change of the save: written by its
 * upload id, so nothing is sent again, with the token of a file already at
 * its path; what the setting named before is taken out as for a file chosen.
 */
export async function stageStoredUpload(
  place: TaskPlace,
  declared: DeclaredInput,
  upload: { id: string; path: string; size: number },
  was: string,
): Promise<StagedInput> {
  const before = await ownBefore(place, ownFolder(declared.id), was);
  const known = before.find((old) => old.path === upload.path);
  const planned: PlannedChange[] = [
    {
      path: upload.path,
      token: known?.token ?? (await tokenNow(place, upload.path)),
      upload: upload.id,
      size: upload.size,
    },
  ];
  for (const old of before) {
    if (old.path !== upload.path) {
      planned.push({ path: old.path, token: old.token, remove: true });
    }
  }
  return {
    id: declared.id,
    value: upload.path,
    was,
    planned,
    summary: `${lastPart(upload.path)}, ${formatSize(upload.size)}`,
  };
}

/**
 * A file for one cell of a run. The editor names the path (`runs/0/1/input`),
 * so the file's own name is never what the task stores.
 */
export async function stageRunFile(
  place: TaskPlace,
  path: string,
  file: File,
  was: string,
): Promise<StagedInput> {
  const token = await tokenNow(place, path);
  const planned: PlannedChange[] = [{ path, token, source: sourceOf(file) }];
  if (was !== '' && was !== path) {
    const old = await tokenNow(place, was);
    if (old !== null) planned.push({ path: was, token: old, remove: true });
  }
  return {
    id: path,
    value: path,
    was,
    planned,
    summary: `${file.name}, ${formatSize(file.size)}`,
  };
}
