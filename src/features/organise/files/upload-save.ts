import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { toApiError } from '@/api/problem';
import type { SaveRequest } from '@/api/types';
import { fileQuery, staleAfterWrite, type Place } from './place';
import type { Outcome } from './SaveOutcome';
import { tokenNow } from './use-task-upload';

type TaskPlace = Extract<Place, { kind: 'task' }>;

/** `token` is the path's file token when the upload began, null for a new file. */
export type ArrivedUpload = {
  upload: string;
  path: string;
  token: string | null;
  size: number | null;
};

/**
 * All uploads go in one task save, so they land in one commit and one
 * confirmation. A refusal keeps the body, so it can be sent again.
 */
export function useSaveUploads(place: TaskPlace, onSaved: (paths: string[]) => void) {
  const queryClient = useQueryClient();
  const saveTask = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/save',
  );
  const [outcome, setOutcome] = useState<Outcome<SaveRequest> | null>(null);
  const [rereading, setRereading] = useState(false);

  const send = async (body: SaveRequest) => {
    setOutcome(null);
    try {
      const result = await saveTask.mutateAsync({
        params: { path: { org: place.org, contest: place.contest, task: place.task } },
        body,
      });
      setOutcome({ kind: 'saved', result });
    } catch (caught) {
      setOutcome({ kind: 'refused', error: toApiError(caught), body });
      return;
    }
    const paths = body.changes.map((change) => change.path);
    onSaved(paths);
    await Promise.all(
      [
        ...staleAfterWrite(place),
        ...paths.map((path) => fileQuery(place, path).queryKey),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  };

  /** Sizes from the last save, for a conflict to show. */
  const sizes = useRef(new Map<string, number | null>());
  const save = (uploads: ArrivedUpload[]) => {
    sizes.current = new Map(uploads.map((upload) => [upload.path, upload.size]));
    return send({
      changes: uploads.map(({ upload, path, token }) => ({
        path,
        token,
        upload,
        encoding: 'utf-8',
        remove: false,
      })),
      confirm: false,
      keep_as_draft: false,
    });
  };

  /** Saves again only the paths in `overwrite`, each with its file's current token. */
  const saveOver = async (body: SaveRequest, overwrite: ReadonlySet<string>) => {
    const kept = body.changes.filter((change) => overwrite.has(change.path));
    if (kept.length === 0) {
      setOutcome(null);
      return;
    }
    setRereading(true);
    try {
      const changes = await Promise.all(
        kept.map(async (change) => ({
          ...change,
          token: await tokenNow(place, change.path),
        })),
      );
      // Going over theirs is another save, asked about again.
      await send({ ...body, changes, confirm: false });
    } catch (error) {
      setOutcome({ kind: 'refused', error: toApiError(error), body });
    } finally {
      setRereading(false);
    }
  };

  return {
    outcome,
    save,
    send,
    saveOver,
    pending: saveTask.isPending || rereading,
    forget: () => setOutcome(null),
    sizeOf: (path: string) => sizes.current.get(path) ?? null,
  };
}
