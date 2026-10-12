import { useState, type FormEvent } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { FileDrop } from '@/ui/FileDrop';
import { Progress } from '@/ui/Progress';
import { formatSize } from '@/lib/size';
import type { Place } from './place';
import { useSaveUploads, type ArrivedUpload } from './upload-save';
import { Refused, UploadSaveAnswer } from './UploadSaveAnswer';
import { useTaskUpload, type UploadState } from './use-task-upload';
import { placeOfIn } from '../task/places';
import shared from '../organise.module.css';
import classes from './Files.module.css';

type TaskPlace = Extract<Place, { kind: 'task' }>;

/** How far the file has got, while it is being read or sent. */
function UnderWay({ state }: { state: UploadState }) {
  if (state.stage !== 'hashing' && state.stage !== 'sending') return null;
  const percent = Math.round(state.share * 100);
  return (
    <div className={shared.stack}>
      <BodyText tone="secondary">
        {state.stage === 'hashing'
          ? `Getting the file ready: ${String(percent)}%`
          : `Uploading: ${String(percent)}%`}
      </BodyText>
      {state.stage === 'sending' && state.attempt > 1 && (
        <BodyText tone="secondary">
          The connection was cut, so it is being sent again from the start (attempt{' '}
          {state.attempt}).
        </BodyText>
      )}
      <Progress value={percent} label={state.stage === 'hashing' ? 'Read' : 'Sent'} />
      <BodyText tone="secondary">Leaving this page now stops the upload.</BodyText>
    </div>
  );
}

/**
 * A file of a task that is an upload, replaced by uploading it again: the
 * new file is sent through the upload door with its progress and saved over
 * the old one at once, presenting the token the old one was read with, a
 * save like any other, which publishes or keeps a draft and answers as a
 * file's save does. A save that needs an answer first (a confirmation in a
 * running contest, someone else's file at the path) holds the upload until
 * it is answered, and says plainly that leaving loses it.
 */
export function TaskUpload({
  place,
  again,
  onClose,
}: {
  place: TaskPlace;
  /** The file uploaded again: its path and the token it was read with. */
  again: { path: string; token: string };
  onClose: () => void;
}) {
  const upload = useTaskUpload(place);
  const [file, setFile] = useState<File | null>(null);
  const [held, setHeld] = useState<ArrivedUpload | null>(null);

  const { state } = upload;
  const working = state.stage === 'hashing' || state.stage === 'sending';

  const saving = useSaveUploads(place, () => {
    upload.reset();
    setHeld(null);
    setFile(null);
  });
  const busy = working || saving.pending;
  const unsaved = held !== null && !saving.pending;

  const choose = (chosen: File[]) => {
    setFile(chosen[0] ?? null);
    saving.forget();
    upload.reset();
    setHeld(null);
  };

  const start = async (event: FormEvent) => {
    event.preventDefault();
    if (file === null) return;
    saving.forget();
    setHeld(null);
    const arrived = await upload.start(file, again.path, again.token);
    if (arrived === null) return;
    const mine = { ...arrived, size: file.size };
    setHeld(mine);
    await saving.save([mine]);
  };

  const discard = () => {
    saving.forget();
    upload.reset();
    setHeld(null);
  };

  return (
    <section className={classes.upload} aria-label={`Upload ${again.path} again`}>
      <form className={shared.stack} onSubmit={(event) => void start(event)}>
        <FileDrop
          label={`New ${again.path}`}
          description="A file of any size. It replaces the one there."
          files={file === null ? [] : [file]}
          onChange={choose}
          disabled={busy}
        />
        <div className={shared.actions}>
          <Button
            type="submit"
            loading={busy}
            disabled={file === null || held !== null}
          >
            Upload and save
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </div>
      </form>

      <div role="status" aria-label="Uploading">
        <UnderWay state={state} />
        {saving.pending && (
          <BodyText tone="secondary">
            Saving {held?.path ?? 'the file'} into the task…
          </BodyText>
        )}
      </div>
      {state.stage === 'refused' && <Refused error={state.error} />}

      <UploadSaveAnswer place={place} saving={saving} placeOf={placeOfIn(place)} />

      {unsaved && (
        <div className={shared.panel} role="alert">
          <BodyText>
            <span className={shared.mono}>{held.path}</span>
            {held.size === null ? '' : `, ${formatSize(held.size)},`} has been uploaded
            but is not saved into the task. Leaving this page loses it.
          </BodyText>
          <div className={shared.actions}>
            <Button variant="secondary" onClick={discard}>
              Discard it
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
