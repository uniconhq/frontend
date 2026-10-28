import { useState } from 'react';
import { toApiError, type ApiError } from '@/api/problem';
import type { SaveChange, TreeEntry } from '@/api/types';
import type { WorkflowPlace } from '../files/place';
import { sendToTask, tokenNow, type UploadState } from '../files/use-task-upload';

/**
 * Where a workflow's uploads wait for the draft's Save, and who is told one is
 * under way. Every uploader of the page shares one: `disabled` holds while
 * any of them uploads or a Save is pending, and `onChange` takes an update
 * of the list as it is then, so two never write over each other's changes.
 */
export type Staging = {
  place: WorkflowPlace;
  changes: SaveChange[];
  onChange: (update: (current: SaveChange[]) => SaveChange[]) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
};

/** `change` staged in `current`: in the place of one at its path, keeping that one's token. */
function staged(current: SaveChange[], change: SaveChange): SaveChange[] {
  const at = current.findIndex((found) => found.path === change.path);
  if (at < 0) return [...current, change];
  return current.map((found, place) =>
    place === at ? { ...change, token: found.token } : found,
  );
}

/**
 * Uploads through the task's door, each staged as a change for the draft's
 * Save; `upload` gives the paths staged, or null when one failed or the
 * page's uploads are locked.
 */
export function useStagedUpload({
  place,
  changes,
  onChange,
  onBusy,
  disabled,
}: Staging) {
  const [state, setState] = useState<UploadState>({ stage: 'idle' });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (
    files: File[],
    pathOf: (file: File) => string,
    replacing?: TreeEntry,
  ): Promise<string[] | null> => {
    if (disabled || busy || files.length === 0) return null;
    setBusy(true);
    onBusy(true);
    setError(null);
    const paths: string[] = [];
    try {
      for (const file of files) {
        const path = pathOf(file);
        const before = changes.find((change) => change.path === path);
        const token =
          before !== undefined
            ? before.token
            : replacing !== undefined
              ? replacing.token
              : await tokenNow(place, path);
        const id = await sendToTask(place, file, path, setState);
        const change: SaveChange = {
          path,
          token,
          upload: id,
          encoding: 'utf-8',
          remove: false,
        };
        paths.push(path);
        // A later failed file keeps the earlier uploads ready to save.
        onChange((current) => staged(current, change));
      }
      setState({ stage: 'idle' });
      return paths;
    } catch (caught) {
      setError(toApiError(caught));
      return null;
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  return { upload, state, error, busy };
}

export type StagedUpload = ReturnType<typeof useStagedUpload>;
