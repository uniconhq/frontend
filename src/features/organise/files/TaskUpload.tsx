import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { WriteTaskFile } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { FileDrop } from '@/ui/FileDrop';
import { Progress } from '@/ui/Progress';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { formatSize } from '@/lib/size';
import { fileQuery, staleAfterWrite, type Place } from './place';
import { SaveOutcome, type Outcome } from './SaveOutcome';
import { tokenNow, useTaskUpload, type UploadState } from './use-task-upload';
import shared from '../organise.module.css';
import classes from './Files.module.css';

type TaskPlace = Extract<Place, { kind: 'task' }>;

/** Where a file chosen in `folder` goes by default: the folder, then its name. */
function pathIn(folder: string, name: string): string {
  return folder === '' ? name : `${folder}/${name}`;
}

/** A path as typed, without the slashes around it that name no folder. */
function cleanPath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '');
}

/**
 * The words for a refusal an organiser's upload or its save can meet that
 * the app otherwise words for a contestant: an upload the forge would not
 * take for this path, or one whose bytes it has not got.
 */
const UPLOAD_REFUSED: Partial<Record<string, { title: string; message: string }>> = {
  invalid_inputs: {
    title: 'The upload does not fit this path',
    message: 'Nothing was saved. Upload the file again for the path it is to go to.',
  },
  upload_not_ready: {
    title: 'The file has not arrived whole',
    message: 'Nothing was saved. Upload it again and it is sent again.',
  },
  upload_failed: {
    title: 'The upload did not go through',
    message:
      'It was sent again from the start and still did not arrive, or the file changed since it was chosen. Nothing was saved; upload it again.',
  },
};

function Refused({ error }: { error: ApiError }) {
  const words = UPLOAD_REFUSED[error.code];
  return (
    <div className={shared.panel} role="alert">
      {words === undefined ? (
        <ErrorBlock error={error} compact />
      ) : (
        <>
          <BodyText tone="secondary">{words.title}</BodyText>
          <BodyText tone="secondary">{error.detail ?? words.message}</BodyText>
        </>
      )}
    </div>
  );
}

/** How far the file has got, while it is being read or sent. */
function UnderWay({ state }: { state: UploadState }) {
  if (state.stage === 'hashing') {
    const percent = Math.round(state.share * 100);
    return (
      <div className={shared.stack}>
        <BodyText tone="secondary">
          Working out the file&apos;s SHA-256: {percent}%
        </BodyText>
        <Progress value={percent} label="Read" />
      </div>
    );
  }
  if (state.stage === 'sending') {
    const percent = Math.round(state.share * 100);
    return (
      <div className={shared.stack}>
        <BodyText tone="secondary">Sending: {percent}%</BodyText>
        {state.attempt > 1 && (
          <BodyText tone="secondary">
            The connection was cut, so it is being sent again from the start (try{' '}
            {state.attempt}).
          </BodyText>
        )}
        <Progress value={percent} label="Sent" />
      </div>
    );
  }
  return null;
}

/**
 * Uploading a file into a task: choose it and the path it goes to, by
 * default the folder picked in the tree and the file's name, then Upload,
 * which reads it for its SHA-256 and sends it through the upload door, each
 * with its progress. An upload that has arrived is not in the task yet, and
 * says so: Save puts it there, a save of the task like any other, which
 * publishes or keeps a draft and answers as a file's save does. Discarding
 * it, or leaving, changes nothing.
 *
 * `again` is a file that is an upload already, replaced by uploading it
 * again: its path is fixed, and the save presents the token it was read
 * with. Otherwise the token is the one of the file at the path when the
 * upload starts, or none for a new file.
 */
export function TaskUpload({
  place,
  folder = '',
  again,
  onClose,
}: {
  place: TaskPlace;
  folder?: string;
  again?: { path: string; token: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const upload = useTaskUpload(place);
  const write = $api.useMutation(
    'put',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/files/{path}',
  );
  const [file, setFile] = useState<File | null>(null);
  const [path, setPath] = useState(again?.path ?? '');
  const [typed, setTyped] = useState(false);
  const [outcome, setOutcome] = useState<Outcome<WriteTaskFile> | null>(null);

  const { state } = upload;
  const working = state.stage === 'hashing' || state.stage === 'sending';
  const target = cleanPath(path);

  const choose = (chosen: File[]) => {
    const next = chosen[0] ?? null;
    setFile(next);
    setOutcome(null);
    upload.reset();
    if (again === undefined && !typed)
      setPath(next === null ? '' : pathIn(folder, next.name));
  };

  const start = (event: FormEvent) => {
    event.preventDefault();
    if (file === null || target === '') return;
    setOutcome(null);
    void upload.start(file, target, again?.token);
  };

  const save = async (body: WriteTaskFile, at: string) => {
    setOutcome(null);
    try {
      const result = await write.mutateAsync({
        params: {
          path: { org: place.org, contest: place.contest, task: place.task, path: at },
        },
        body,
      });
      setOutcome({ kind: 'saved', result });
      upload.reset();
      setFile(null);
    } catch (caught) {
      setOutcome({ kind: 'refused', error: toApiError(caught), body });
      return;
    }
    await Promise.all(
      [...staleAfterWrite(place), fileQuery(place, at).queryKey].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };

  const arrived = state.stage === 'arrived' ? state : null;
  const firstSave = (): WriteTaskFile | null =>
    arrived === null
      ? null
      : {
          upload: arrived.upload,
          token: arrived.token,
          encoding: 'utf-8',
          confirm: false,
          keep_as_draft: false,
        };
  const savedAt = arrived?.path ?? target;

  /** Saves the same upload again, presenting the token the file has now. */
  const saveOver = async (body: WriteTaskFile) => {
    let token: string | null;
    try {
      token = await tokenNow(place, savedAt);
    } catch (error) {
      setOutcome({ kind: 'refused', error: toApiError(error), body });
      return;
    }
    await save({ ...body, token }, savedAt);
  };

  return (
    <section
      className={classes.upload}
      aria-label={again === undefined ? 'Upload a file' : `Upload ${again.path} again`}
    >
      <form className={shared.stack} onSubmit={start}>
        <FileDrop
          label={again === undefined ? 'File to upload' : `New ${again.path}`}
          description="Any size; it goes to the forge's own store, not through the editor."
          files={file === null ? [] : [file]}
          onChange={choose}
          disabled={working || write.isPending}
        />
        <TextInput
          label="Path in the task"
          value={path}
          onChange={(value) => {
            setTyped(true);
            setPath(value);
          }}
          description={
            again === undefined
              ? 'Where the file goes, such as data/train.csv. A file there now is replaced.'
              : 'Uploading again replaces the file at this path.'
          }
          disabled={again !== undefined || working || write.isPending}
          required
        />
        <div className={shared.actions}>
          <Button
            type="submit"
            loading={working}
            disabled={file === null || target === '' || arrived !== null}
          >
            Upload
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={working}>
            Close
          </Button>
        </div>
      </form>

      <div role="status" aria-label="Uploading">
        <UnderWay state={state} />
      </div>
      {state.stage === 'refused' && <Refused error={state.error} />}

      {arrived !== null && outcome === null && (
        <div className={shared.panel} role="status">
          <BodyText>
            <span className={shared.mono}>{arrived.path}</span> has arrived
            {file === null ? '' : `, ${formatSize(file.size)}`}.
          </BodyText>
          <BodyText>
            It is not in the task yet. Saving puts it there, as a save of the task that
            publishes or keeps a draft
            {arrived.token === null ? '' : ', and replaces the file there now'}.
          </BodyText>
          <div className={shared.actions}>
            <Button
              loading={write.isPending}
              onClick={() => {
                const body = firstSave();
                if (body !== null) void save(body, arrived.path);
              }}
            >
              Save into the task
            </Button>
            <Button
              variant="secondary"
              disabled={write.isPending}
              onClick={() => {
                upload.reset();
                setFile(null);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      {outcome !== null &&
        (outcome.kind === 'refused' &&
        UPLOAD_REFUSED[outcome.error.code] !== undefined ? (
          <Refused error={outcome.error} />
        ) : outcome.kind === 'refused' && outcome.error.code === 'conflict' ? (
          <div className={shared.panel} role="alert">
            <BodyText>
              Someone else changed <span className={shared.mono}>{savedAt}</span> since
              the upload began.
            </BodyText>
            <BodyText tone="secondary">
              Nothing was saved. Saving again replaces their version with this upload.
            </BodyText>
            <div className={shared.actions}>
              <Button
                size="xs"
                variant="secondary"
                loading={write.isPending}
                onClick={() => void saveOver(outcome.body)}
              >
                Save over their version
              </Button>
            </div>
          </div>
        ) : (
          <SaveOutcome
            outcome={outcome}
            onConfirm={(body) => void save({ ...body, confirm: true }, savedAt)}
            onKeepAsDraft={(body) =>
              void save({ ...body, keep_as_draft: true }, savedAt)
            }
            onReload={() => undefined}
          />
        ))}
    </section>
  );
}
