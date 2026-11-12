import type { DeclaredInput } from '@/api/types';
import { formatSize } from '@/lib/size';
import { tokenNow } from '../files/use-task-upload';
import { lastPart, type TaskPlace } from './build-data';
import { filesUnder, type PlannedChange, type Source } from './staged';

/**
 * A file or a folder chosen on the Inputs card or in a run's cell (M51),
 * waiting for the one save of the task: written at the top of the task under
 * its own name, a folder with the files inside it, and what the setting or
 * cell then names. What it replaces is taken out.
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

/** A file chosen on the disk as a source of the save. */
function sourceOf(file: File): Source {
  return { path: file.name, size: file.size, read: () => Promise.resolve(file) };
}

/** A file's own path: its name, or `data/a.csv` inside a folder chosen. */
function ownPath(file: File): string {
  return file.webkitRelativePath || file.name;
}

/** The file or folder's files `was` names, with their tokens, to take out. */
async function replaced(
  place: TaskPlace,
  was: string,
): Promise<{ path: string; token: string }[]> {
  if (was === '') return [];
  if (was.endsWith('/')) return filesUnder(place, was.slice(0, -1));
  const token = await tokenNow(place, was);
  return token === null ? [] : [{ path: was, token }];
}

/** The planned writes, and the replaced files they do not write over taken out. */
async function withReplaced(
  place: TaskPlace,
  planned: PlannedChange[],
  was: string,
): Promise<PlannedChange[]> {
  const old = (await replaced(place, was)).filter(
    (file) => !planned.some((change) => change.path === file.path),
  );
  return [
    ...planned,
    ...old.map((file) => ({
      path: file.path,
      token: file.token,
      remove: true as const,
    })),
  ];
}

/** The files chosen for a setting as one change of the save. */
export async function stageInputFiles(
  place: TaskPlace,
  declared: DeclaredInput,
  files: File[],
  was: string,
): Promise<StagedInput> {
  const folder = declared.type === 'folder';
  const planned: PlannedChange[] = [];
  for (const file of files) {
    const path = ownPath(file);
    planned.push({ path, token: await tokenNow(place, path), source: sourceOf(file) });
  }
  const first = planned[0]?.path ?? '';
  const size = files.reduce((sum, file) => sum + file.size, 0);
  return {
    id: declared.id,
    value: folder ? `${first.split('/')[0] ?? ''}/` : first,
    was,
    planned: await withReplaced(place, planned, was),
    summary:
      files.length === 1 && !folder
        ? `${files[0]?.name ?? ''}, ${formatSize(size)}`
        : `${String(files.length)} ${files.length === 1 ? 'file' : 'files'}, ${formatSize(size)}`,
  };
}

/** Whether an upload is one a file setting can take: a single file, not in a folder. */
export function uploadFits(declared: DeclaredInput, path: string): boolean {
  return declared.type === 'file' && path !== '' && !path.includes('/');
}

/**
 * An upload the door holds and no save has used yet, chosen for the file
 * setting it fits (`uploadFits`), as one change of the save: written by its
 * upload id, so nothing is sent again.
 */
export async function stageStoredUpload(
  place: TaskPlace,
  declared: DeclaredInput,
  upload: { id: string; path: string; size: number },
  was: string,
): Promise<StagedInput> {
  return {
    id: declared.id,
    value: upload.path,
    was,
    planned: await withReplaced(
      place,
      [
        {
          path: upload.path,
          token: await tokenNow(place, upload.path),
          upload: upload.id,
          size: upload.size,
        },
      ],
      was,
    ),
    summary: `${lastPart(upload.path)}, ${formatSize(upload.size)}`,
  };
}

/** A file for one cell of a run, in place of the one it named, `was`. */
export async function stageRunFile(
  place: TaskPlace,
  file: File,
  was: string,
): Promise<StagedInput> {
  const path = file.name;
  return {
    id: path,
    value: path,
    was: '',
    planned: await withReplaced(
      place,
      [{ path, token: await tokenNow(place, path), source: sourceOf(file) }],
      was,
    ),
    summary: `${file.name}, ${formatSize(file.size)}`,
  };
}
