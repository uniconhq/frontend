import { useRef, useState } from 'react';
import { apiClient } from '@/api/client';
import { $api } from '@/api/query';
import { type ApiError, toApiError } from '@/api/problem';
import { arrival, hashOf, mustBeVerified, sendAndComplete } from '@/api/upload/door';
import type { Place } from './place';

type TaskPlace = Extract<Place, { kind: 'task' }>;

/**
 * How many times a file is sent before the upload gives up: a cut connection
 * sends it again, from the start, to the same slot.
 */
const SEND_TRIES = 3;

/**
 * Where an organiser's upload is: not started, reading the file to work out
 * its SHA-256, sending it (the try it is on counting from 1), arrived and
 * waiting for the save that puts it into the task, or refused. Shares run
 * from 0 to 1.
 */
export type UploadState =
  | { stage: 'idle' }
  | { stage: 'hashing'; share: number }
  | { stage: 'sending'; share: number; attempt: number }
  | { stage: 'arrived'; upload: string; path: string; token: string | null }
  | { stage: 'refused'; error: ApiError };

/**
 * The token of the file at `path` now, or null when there is no file there
 * yet: what a save writing that path presents.
 */
export async function tokenNow(place: TaskPlace, path: string): Promise<string | null> {
  const task = { org: place.org, contest: place.contest, task: place.task };
  try {
    // Read past the query cache, so a file open in the editor keeps the text
    // and the token it was read with.
    const { data } = await apiClient.GET(
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/files/{path}',
      { params: { path: { ...task, path } } },
    );
    return data?.token ?? null;
  } catch (error) {
    if (toApiError(error).code === 'not_found') return null;
    throw error;
  }
}

/**
 * Puts a file through the upload door for a task, at a path: the token of
 * the file there now, the SHA-256 with its progress, a slot for the path,
 * the bytes with their progress and the completion. A send the connection
 * cut is sent again from the start, to the same slot, after asking whether
 * the bytes arrived after all; a slot for a file the forge holds already
 * needs nothing sent. Nothing is in the task until a save names the upload;
 * the caller makes that save, with the token this read.
 */
export function useTaskUpload(place: TaskPlace) {
  const requestSlot = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/organise/uploads',
  );
  const complete = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/uploads/{upload}/complete',
  );
  const [state, setState] = useState<UploadState>({ stage: 'idle' });
  const busy = useRef(false);
  const task = { org: place.org, contest: place.contest, task: place.task };

  const start = async (file: File, path: string, token?: string | null) => {
    if (busy.current) return;
    busy.current = true;
    try {
      // The token is the one the caller read the file with, or the file's as
      // the upload starts, so a change made meanwhile is a conflict at the save.
      const current = token === undefined ? await tokenNow(place, path) : token;
      setState({ stage: 'hashing', share: 0 });
      const sha256 = await hashOf(file, (share) =>
        setState({ stage: 'hashing', share }),
      );
      setState({ stage: 'sending', share: 0, attempt: 1 });
      const slot = await requestSlot.mutateAsync({
        params: { path: task },
        body: {
          path,
          size: file.size,
          sha256,
          content_type: file.type === '' ? null : file.type,
        },
      });
      const completeSlot = () =>
        complete.mutateAsync({ params: { path: { ...task, upload: slot.id } } });

      for (let attempt = 1; ; attempt += 1) {
        const share = (sent: number) =>
          setState({ stage: 'sending', share: sent, attempt });
        try {
          const arrived = attempt === 1 ? null : await arrival(completeSlot);
          share(0);
          mustBeVerified(
            arrived ?? (await sendAndComplete(slot, file, share, completeSlot)),
          );
          break;
        } catch (error) {
          const cut = toApiError(error).code === 'upload_failed';
          if (!cut || attempt >= SEND_TRIES) throw error;
        }
      }
      setState({ stage: 'arrived', upload: slot.id, path, token: current });
    } catch (error) {
      setState({ stage: 'refused', error: toApiError(error) });
    } finally {
      busy.current = false;
    }
  };

  return {
    state,
    start,
    /** Forgets the upload, which is in the task only once saved. */
    reset: () => setState({ stage: 'idle' }),
  };
}
