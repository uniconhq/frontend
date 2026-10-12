import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { toApiError, type ApiError } from '@/api/problem';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { FileDrop } from '@/ui/FileDrop';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { staleAfterWrite, type Place } from '../files/place';
import { sendToTask } from '../files/use-task-upload';
import { fileChanges } from '../task/staged';
import shared from '../organise.module.css';
import { freeName, pictureLine, pictureName } from './picture-name';

type TaskPlace = Extract<Place, { kind: 'task' }>;

/** The names of the files under the task's `public/` now, none when it has no such folder. */
async function picturesNow(task: TaskPlace): Promise<Set<string>> {
  try {
    const { data } = await apiClient.GET(
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/tree',
      {
        params: {
          path: { org: task.org, contest: task.contest, task: task.task },
          query: { path: 'public' },
        },
      },
    );
    return new Set((data ?? []).map((entry) => entry.path.slice('public/'.length)));
  } catch (error) {
    if (toApiError(error).code === 'not_found') return new Set();
    throw error;
  }
}

/**
 * "Add a picture" on the Statement card (M51): a picture chosen is saved
 * into the task's `public/` folder at once, under a name of its own, a large
 * one through the upload door as a test's file is, and the statement's text
 * gets the line that shows it, `![diagram](public/diagram.png)`, at its end,
 * for the organiser to move and to save with the statement.
 */
export function AddPicture({
  task,
  onAdded,
  disabled,
}: {
  task: TaskPlace;
  /** The line that shows the picture, for the statement's text. */
  onAdded: (line: string) => void;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<ApiError | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const add = async (file: File) => {
    setBusy(true);
    setRefused(null);
    setAdded(null);
    try {
      const name = freeName(pictureName(file.name), await picturesNow(task));
      const path = `public/${name}`;
      const changes = await fileChanges(
        [
          {
            path,
            token: null,
            source: {
              path: file.name,
              size: file.size,
              read: () => Promise.resolve(file),
            },
          },
        ],
        (at) => sendToTask(task, file, at),
      );
      await apiClient.POST('/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/save', {
        params: { path: { org: task.org, contest: task.contest, task: task.task } },
        body: { changes, confirm: false, keep_as_draft: false },
      });
      await Promise.all(
        staleAfterWrite(task).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      onAdded(pictureLine(file.name, path));
      setAdded(name);
      setOpen(false);
    } catch (error) {
      setRefused(toApiError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={shared.stack}>
      {!open && (
        <div className={shared.actions}>
          <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled}>
            Add a picture
          </Button>
        </div>
      )}
      {open && (
        <>
          <FileDrop
            label="Picture"
            description="It is saved with the task at once, and written at the end of the statement for you to move."
            accept="image/*"
            files={[]}
            onChange={(chosen) => {
              const [file] = chosen;
              if (file !== undefined) void add(file);
            }}
            disabled={busy}
          />
          <div className={shared.actions}>
            {busy && <BodyText tone="secondary">Adding the picture…</BodyText>}
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </>
      )}
      {added !== null && (
        <BodyText tone="secondary">
          {added} is in the task, and the statement shows it from where it is written at
          its end. Save the statement to keep that.
        </BodyText>
      )}
      {refused !== null && <ErrorBlock error={refused} compact />}
    </div>
  );
}
