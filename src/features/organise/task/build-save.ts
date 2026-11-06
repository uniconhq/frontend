import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { toApiError } from '@/api/problem';
import type { SaveRequest, SaveResult } from '@/api/types';
import { partUploadsQuery } from '@/api/upload/parts';
import type { Outcome } from '../files/SaveOutcome';
import { fileQuery, staleAfterWrite } from '../files/place';
import { sendToTask, tokenNow } from '../files/use-task-upload';
import type { Values } from '../forms/values';
import { taskPath, type TaskPlace } from './build-data';
import { fileChanges, type PlannedChange, type Source } from './staged';

/**
 * One save of the task's cards: the settings' values as the cards changed
 * them, read at a token, and every test file written or taken out, in one
 * save, so one publication and, while the contest runs, one confirmation.
 */
export type Attempt = {
  settings: { values: Values; token: string | null } | null;
  planned: PlannedChange[];
};

/** A file someone else changed since a change to it was made here. */
export type FileConflict = { change: PlannedChange; now: string | null };

export type SaveState =
  | { stage: 'idle' }
  | { stage: 'sending'; sent: number; of: number }
  | { stage: 'saving' };

const TASK_FILE = 'task.yaml';

/**
 * Saving the task's cards. A save answered with a conflict is looked into:
 * when the settings moved, the refusal says so, for the cards to be read
 * again; when only a test's file moved, the files someone else changed are
 * listed (`conflicts`), each to keep theirs or to save over. Larger files go
 * through the upload door first, once: a save sent again reuses them.
 * `onSaved` hears every save that went through, published or kept as a draft.
 */
export function useTaskSave(place: TaskPlace, onSaved: () => Promise<void> | void) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SaveState>({ stage: 'idle' });
  const [outcome, setOutcome] = useState<Outcome<SaveRequest> | null>(null);
  const [conflicts, setConflicts] = useState<{
    attempt: Attempt;
    files: FileConflict[];
  } | null>(null);
  const uploads = useRef(new Map<string, { source: Source; id: string }>());
  /** The last save tried, which a refusal's confirmation sends again. */
  const last = useRef<Attempt>({ settings: null, planned: [] });

  const upload = async (path: string, source: Source): Promise<string> => {
    const known = uploads.current.get(path);
    if (known !== undefined && known.source === source) return known.id;
    const blob = await source.read();
    const file =
      blob instanceof File ? blob : new File([blob], path.split('/').pop() ?? 'file');
    const id = await sendToTask(place, file, path);
    uploads.current.set(path, { source, id });
    return id;
  };

  /**
   * Whether a refused save is down to test files someone else changed, now
   * listed. Settings that moved are the refusal's to say.
   */
  const lookInto = async (attempt: Attempt) => {
    if (attempt.settings !== null) {
      const { data } = await apiClient.GET(
        '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/settings',
        { params: { path: taskPath(place) } },
      );
      if (data !== undefined && data.token !== attempt.settings.token) return false;
    }
    const files = await Promise.all(
      attempt.planned.map(async (change) => {
        const now = await tokenNow(place, change.path);
        return now === change.token ? null : { change, now };
      }),
    );
    const moved = files.filter((file): file is FileConflict => file !== null);
    if (moved.length === 0) return false;
    setConflicts({ attempt, files: moved });
    return true;
  };

  const send = async (body: SaveRequest, attempt: Attempt) => {
    setState({ stage: 'saving' });
    let result: SaveResult;
    try {
      const { data } = await apiClient.POST(
        '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/save',
        { params: { path: taskPath(place) }, body },
      );
      if (data === undefined) throw new Error('The save got no answer. Try again.');
      result = data;
    } catch (caught) {
      const error = toApiError(caught);
      setState({ stage: 'idle' });
      if (error.code === 'conflict') {
        try {
          if (await lookInto(attempt)) return;
        } catch {
          // What moved could not be read; the refusal says what happened.
        }
      }
      setOutcome({ kind: 'refused', error, body });
      return;
    }
    uploads.current.clear();
    setOutcome({ kind: 'saved', result });
    await Promise.all(
      [
        ...staleAfterWrite(place),
        // A stored upload the save wrote is no longer open.
        partUploadsQuery(place).queryKey,
        ...body.changes.map((change) => fileQuery(place, change.path).queryKey),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
    setState({ stage: 'idle' });
    await onSaved();
  };

  /** The attempt as a save's body, its larger files sent first. */
  const bodyOf = async (attempt: Attempt): Promise<SaveRequest> => {
    const total = attempt.planned.filter(
      (change) => 'source' in change && !('remove' in change),
    ).length;
    let sent = 0;
    setState({ stage: 'sending', sent, of: total });
    const files = await fileChanges(attempt.planned, async (path, source) => {
      const id = await upload(path, source);
      sent += 1;
      setState({ stage: 'sending', sent, of: total });
      return id;
    });
    return {
      changes: [
        ...(attempt.settings === null
          ? []
          : [
              {
                path: TASK_FILE,
                token: attempt.settings.token,
                values: attempt.settings.values,
                encoding: 'utf-8' as const,
                remove: false,
              },
            ]),
        ...files,
      ],
      confirm: false,
      keep_as_draft: false,
    };
  };

  const save = async (attempt: Attempt) => {
    last.current = attempt;
    setOutcome(null);
    setConflicts(null);
    let body: SaveRequest;
    try {
      body = await bodyOf(attempt);
    } catch (caught) {
      setState({ stage: 'idle' });
      setOutcome({
        kind: 'refused',
        error: toApiError(caught),
        body: { changes: [], confirm: false, keep_as_draft: false },
      });
      return;
    }
    await send(body, attempt);
  };

  /** The same save again, confirmed or kept as a draft, as a refusal asked. */
  const again = (
    body: SaveRequest,
    flags: { confirm?: boolean; asked?: string; keep_as_draft?: boolean },
  ) => {
    setOutcome(null);
    void send({ ...body, ...flags }, last.current);
  };

  return {
    state,
    outcome,
    conflicts,
    save,
    again,
    /**
     * The files someone else changed resolved: each kept as theirs, its change
     * dropped, or saved over theirs, at the token it has now.
     */
    saveResolved: (overwrite: ReadonlySet<string>) => {
      if (conflicts === null) return;
      const moved = new Map(
        conflicts.files.map((file) => [file.change.path, file.now]),
      );
      const planned = conflicts.attempt.planned.flatMap((change): PlannedChange[] => {
        if (!moved.has(change.path)) return [change];
        if (!overwrite.has(change.path)) return [];
        const now = moved.get(change.path) ?? null;
        if ('remove' in change) {
          return now === null ? [] : [{ ...change, token: now }];
        }
        return [{ ...change, token: now }];
      });
      void save({ ...conflicts.attempt, planned });
    },
    drop: () => {
      setConflicts(null);
      setOutcome(null);
    },
    forget: () => setOutcome(null),
  };
}

export type TaskSave = ReturnType<typeof useTaskSave>;
