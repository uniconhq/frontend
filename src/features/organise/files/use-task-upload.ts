import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/api/client';
import { byPlace } from '@/api/place';
import { ApiError, toApiError } from '@/api/problem';
import { hashOf } from '@/api/upload/door';
import { abortPartUpload, uploadInParts } from '@/api/upload/parts';
import type { Place, WorkflowPlace } from './place';

type TaskPlace = Extract<Place, { kind: 'task' }> | WorkflowPlace;

/**
 * Where an organiser's upload is: not started, reading the file to work out
 * its SHA-256, sending it, being stored, arrived and waiting for the save that
 * puts it into the task, or refused. Shares run from 0 to 1.
 */
export type UploadState =
  | { stage: 'idle' }
  | { stage: 'hashing'; share: number }
  | { stage: 'sending'; share: number }
  | { stage: 'storing' }
  | { stage: 'arrived'; upload: string; path: string; token: string | null }
  | { stage: 'refused'; error: ApiError };

/**
 * The token of the file at `path` now, or null when there is no file there
 * yet: what a save writing that path presents.
 */
export async function tokenNow(place: TaskPlace, path: string): Promise<string | null> {
  try {
    // Read past the query cache, so a file open in the editor keeps the text
    // and the token it was read with.
    return await byPlace(place, {
      workflow: async (at) =>
        (
          await apiClient.GET('/api/v1/workflows/{owner}/{name}/files/{path}', {
            params: { path: { ...at, path } },
          })
        ).data?.token ?? null,
      task: async (at) =>
        (
          await apiClient.GET(
            '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/files/{path}',
            { params: { path: { ...at, path } } },
          )
        ).data?.token ?? null,
    });
  } catch (error) {
    if (toApiError(error).code === 'not_found') return null;
    throw error;
  }
}

/**
 * Hashes an organiser's file, resumes server-listed parts and waits for
 * verified storage; aborting `signal` stops it and keeps the parts sent.
 */
export async function sendToTask(
  place: TaskPlace,
  file: File,
  path: string,
  onState: (state: UploadState) => void = () => undefined,
  expectedDigest?: string,
  signal?: AbortSignal,
): Promise<string> {
  onState({ stage: 'hashing', share: 0 });
  const sha256 = await hashOf(file, (share) => onState({ stage: 'hashing', share }));
  if (expectedDigest !== undefined && sha256 !== expectedDigest)
    throw new ApiError({
      code: 'invalid_inputs',
      status: 422,
      title: 'Choose the same file to resume this upload',
      detail:
        'This is not the file the upload started with. Choose that file to resume it.',
    });
  onState({ stage: 'sending', share: 0 });
  return uploadInParts(
    place,
    file,
    path,
    sha256,
    (share) => onState({ stage: 'sending', share }),
    () => onState({ stage: 'storing' }),
    signal,
  );
}

/**
 * An upload into a task at a path, through the upload door (`sendToTask`),
 * with where it stands to show, and the token of the file at the path, which
 * the caller's save presents. `start` answers the upload once it has
 * arrived, for the caller to save at once, or null when it did not.
 */
export function useTaskUpload(place: TaskPlace) {
  const [state, setState] = useState<UploadState>({ stage: 'idle' });
  const busy = useRef(false);
  const sending = useRef<AbortController | null>(null);
  // Leaving the page stops sending and waiting; the parts sent stay to resume.
  useEffect(() => () => sending.current?.abort(), []);

  const start = async (
    file: File,
    path: string,
    token?: string | null,
    expectedDigest?: string,
  ): Promise<{ upload: string; path: string; token: string | null } | null> => {
    if (busy.current) return null;
    busy.current = true;
    try {
      // The token is the one the caller read the file with, or the file's as
      // the upload starts, so a change made meanwhile is a conflict at the save.
      const current = token === undefined ? await tokenNow(place, path) : token;
      const controller = new AbortController();
      sending.current = controller;
      const upload = await sendToTask(
        place,
        file,
        path,
        setState,
        expectedDigest,
        controller.signal,
      );
      const arrived = { upload, path, token: current };
      setState({ stage: 'arrived', ...arrived });
      return arrived;
    } catch (error) {
      setState({ stage: 'refused', error: toApiError(error) });
      return null;
    } finally {
      busy.current = false;
    }
  };

  return {
    state,
    start,
    cancel: async (id: string): Promise<boolean> => {
      try {
        await abortPartUpload(place, id);
        return true;
      } catch (error) {
        setState({ stage: 'refused', error: toApiError(error) });
        return false;
      }
    },
    /** Forgets the upload, which is in the task only once saved. */
    reset: () => setState({ stage: 'idle' }),
  };
}
