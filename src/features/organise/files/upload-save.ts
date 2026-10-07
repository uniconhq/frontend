import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { toApiError } from '@/api/problem';
import type { SaveRequest } from '@/api/types';
import { fileQuery, staleAfterWrite, type Place } from './place';
import type { Outcome } from './SaveOutcome';
import { tokenNow } from './use-task-upload';

type TaskPlace = Extract<Place, { kind: 'task' }>;

/**
 * An upload that has arrived and is not in the task yet: its id, the path it
 * goes to, the token of the file at that path when the upload began (null for
 * a new file), and its size when the page knows it.
 */
export type ArrivedUpload = {
  upload: string;
  path: string;
  token: string | null;
  size: number | null;
};

/**
 * Saving uploads into a task: one save of the task naming each by its upload
 * id, with the token of its path, so however many there are they land in one
 * commit, one publication and, in a running contest, one confirmation. A
 * refusal keeps the body, so a confirmation or a draft sends the same save
 * again; a conflict is saved over by reading every path's token afresh.
 * `onSaved` hears the paths of a save that went through, published or kept
 * as a draft.
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

  const save = (uploads: ArrivedUpload[]) =>
    send({
      changes: uploads.map(({ upload, path, token }) => ({
        path,
        token,
        upload,
        encoding: 'utf-8',
      })),
      confirm: false,
      keep_as_draft: false,
    });

  /** The same save again, each path presenting the token its file has now. */
  const saveOver = async (body: SaveRequest) => {
    setRereading(true);
    try {
      const changes = await Promise.all(
        body.changes.map(async (change) => ({
          ...change,
          token: await tokenNow(place, change.path),
        })),
      );
      await send({ ...body, changes });
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
  };
}
