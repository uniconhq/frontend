import { apiClient } from '@/api/client';
import { toApiError } from '@/api/problem';
import type { SaveChange } from '@/api/types';
import { tokenNow } from '../files/use-task-upload';
import type { TaskPlace } from './build-data';

/** A file to add, from the disk: its name or path, its size, its bytes. */
export type Source = { path: string; size: number; read: () => Promise<Blob> };

/** A file of the task as it was when a change to it was made. */
type Existing = { path: string; token: string; size: number | null };

const TREE = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/tree';

/** Every file under a folder of the task, each with its token, listed now. */
export async function filesUnder(
  place: TaskPlace,
  folder: string,
): Promise<Existing[]> {
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
      // The listing gives each file's token as a read does; a listing that
      // does not is read past, file by file.
      const token = entry.token ?? (await tokenNow(place, entry.path));
      return token === null ? [] : [{ path: entry.path, token, size: entry.size }];
    }),
  );
  return found.flat();
}

/** One file the save writes: typed text, or a file's bytes; or one it removes. */
export type PlannedChange =
  | { path: string; token: string | null; text: string }
  | { path: string; token: string | null; source: Source }
  | { path: string; token: string; remove: true };

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
