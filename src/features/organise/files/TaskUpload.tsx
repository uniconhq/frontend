import { useEffect, useState, type FormEvent } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { FileDrop } from '@/ui/FileDrop';
import { Progress } from '@/ui/Progress';
import { TextInput } from '@/ui/TextInput';
import { formatSize } from '@/lib/size';
import type { Place } from './place';
import { useSaveUploads, type ArrivedUpload } from './upload-save';
import { Refused, UploadSaveAnswer } from './UploadSaveAnswer';
import { useTaskUpload, type UploadState } from './use-task-upload';
import { useWaitingUploads } from './waiting-uploads';
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
 * Where the page keeps waiting uploads (the file panel), an arrived upload
 * may instead be kept waiting, to be saved later together with others, and
 * its own Save takes every waiting one with it: several files, one save.
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
  const upload = useTaskUpload(place);
  const waiting = useWaitingUploads();
  const [file, setFile] = useState<File | null>(null);
  const [path, setPath] = useState(again?.path ?? '');
  const [typed, setTyped] = useState(false);

  const { state } = upload;
  const working = state.stage === 'hashing' || state.stage === 'sending';
  const target = cleanPath(path);
  const arrived = state.stage === 'arrived' ? state : null;
  const others = (waiting?.uploads ?? []).filter((kept) => kept.path !== arrived?.path);

  const forget = () => {
    upload.reset();
    setFile(null);
  };
  const saving = useSaveUploads(place, (paths) => {
    waiting?.saved(paths);
    forget();
  });

  // While it holds an arrived upload, its Save is the one that takes the
  // waiting uploads with it, so the waiting list's own Save steps aside.
  const holding = arrived !== null && saving.outcome === null;
  const hold = waiting?.hold;
  useEffect(() => {
    if (!holding || hold === undefined) return;
    hold(true);
    return () => hold(false);
  }, [holding, hold]);

  const choose = (chosen: File[]) => {
    const next = chosen[0] ?? null;
    setFile(next);
    saving.forget();
    upload.reset();
    if (again === undefined && !typed)
      setPath(next === null ? '' : pathIn(folder, next.name));
  };

  const start = (event: FormEvent) => {
    event.preventDefault();
    if (file === null || target === '') return;
    saving.forget();
    void upload.start(file, target, again?.token);
  };

  const own = (): ArrivedUpload | null =>
    arrived === null
      ? null
      : {
          upload: arrived.upload,
          path: arrived.path,
          token: arrived.token,
          size: file?.size ?? null,
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
          disabled={working || saving.pending}
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
          disabled={again !== undefined || working || saving.pending}
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

      {arrived !== null && saving.outcome === null && (
        <div className={shared.panel} role="status">
          <BodyText>
            <span className={shared.mono}>{arrived.path}</span> has arrived
            {file === null ? '' : `, ${formatSize(file.size)}`}.
          </BodyText>
          <BodyText>
            It is not in the task yet. Saving puts it there, as a save of the task that
            publishes or keeps a draft
            {arrived.token === null ? '' : ', and replaces the file there now'}.
            {others.length > 0 &&
              ` The ${others.length === 1 ? 'upload' : `${String(others.length)} uploads`} waiting to be saved go in the same save.`}
          </BodyText>
          <div className={shared.actions}>
            <Button
              loading={saving.pending}
              onClick={() => {
                const mine = own();
                if (mine !== null) void saving.save([...others, mine]);
              }}
            >
              Save into the task
            </Button>
            {waiting !== null && (
              <Button
                variant="secondary"
                disabled={saving.pending}
                onClick={() => {
                  const mine = own();
                  if (mine !== null) waiting.keep(mine);
                  forget();
                  if (again !== undefined) onClose();
                }}
              >
                Keep it waiting
              </Button>
            )}
            <Button variant="secondary" disabled={saving.pending} onClick={forget}>
              Discard
            </Button>
          </div>
        </div>
      )}

      <UploadSaveAnswer saving={saving} />
    </section>
  );
}
