import { useState, type FormEvent } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { FileDrop } from '@/ui/FileDrop';
import { PageLink } from '@/ui/PageLink';
import { Progress } from '@/ui/Progress';
import { TextInput } from '@/ui/TextInput';
import { formatSize } from '@/lib/size';
import { taskCardPath } from '@/lib/sections';
import type { Place } from './place';
import { useSaveUploads, type ArrivedUpload } from './upload-save';
import { Refused, UploadSaveAnswer } from './UploadSaveAnswer';
import { useTaskUpload, type UploadState } from './use-task-upload';
import { placeOfIn } from '../task/places';
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
 * Why a path is not one Files takes, and where that file is changed instead:
 * a test is added on the Tests and scoring card, and the task's settings are
 * its page's. Null for a path Files takes.
 */
function elsewhere(path: string): { why: string; card: 'tests' | 'workflow' } | null {
  if (path === 'tests' || path.startsWith('tests/')) {
    return {
      why: 'Tests are added on the task’s page, in its Tests and scoring card.',
      card: 'tests',
    };
  }
  if (path === 'task.yaml') {
    return { why: 'The task’s settings are changed on its page.', card: 'workflow' };
  }
  return null;
}

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
          The connection was cut, so it is being sent again from the start (try{' '}
          {state.attempt}).
        </BodyText>
      )}
      <Progress value={percent} label={state.stage === 'hashing' ? 'Read' : 'Sent'} />
      <BodyText tone="secondary">Leaving this page now stops the upload.</BodyText>
    </div>
  );
}

/**
 * Uploading a file into a task: choose it and where it goes, by default the
 * folder picked in the tree and the file's name, then Upload and save, which
 * sends it through the upload door with its progress and saves it into the
 * task at once, a save like any other, which publishes or keeps a draft and
 * answers as a file's save does. A save that needs an answer first (a
 * confirmation in a running contest, someone else's file at the path) holds
 * the upload until it is answered, and says plainly that leaving loses it.
 * Tests and the task's settings are not uploaded here: the form says where
 * they are changed.
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
  const [file, setFile] = useState<File | null>(null);
  const [path, setPath] = useState(again?.path ?? '');
  const [typed, setTyped] = useState(false);
  const [held, setHeld] = useState<ArrivedUpload | null>(null);

  const { state } = upload;
  const working = state.stage === 'hashing' || state.stage === 'sending';
  const target = cleanPath(path);
  const other = elsewhere(target);

  const saving = useSaveUploads(place, () => {
    upload.reset();
    setHeld(null);
    setFile(null);
    if (again === undefined) setPath('');
    setTyped(false);
  });
  const busy = working || saving.pending;
  const unsaved = held !== null && !saving.pending;

  const choose = (chosen: File[]) => {
    const next = chosen[0] ?? null;
    setFile(next);
    saving.forget();
    upload.reset();
    setHeld(null);
    if (again === undefined && !typed)
      setPath(next === null ? '' : pathIn(folder, next.name));
  };

  const start = async (event: FormEvent) => {
    event.preventDefault();
    if (file === null || target === '' || other !== null) return;
    saving.forget();
    setHeld(null);
    const arrived = await upload.start(file, target, again?.token);
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
    <section
      className={classes.upload}
      aria-label={again === undefined ? 'Upload a file' : `Upload ${again.path} again`}
    >
      <form className={shared.stack} onSubmit={(event) => void start(event)}>
        <FileDrop
          label={again === undefined ? 'File to upload' : `New ${again.path}`}
          description="A file of any size."
          files={file === null ? [] : [file]}
          onChange={choose}
          disabled={busy}
        />
        <TextInput
          label="Where it goes"
          value={path}
          onChange={(value) => {
            setTyped(true);
            setPath(value);
          }}
          description={
            again === undefined
              ? 'A path in the task’s files, such as public/diagram.png. A file there now is replaced.'
              : 'Uploading again replaces the file here.'
          }
          error={other?.why}
          disabled={again !== undefined || busy}
          required
        />
        {other !== null && (
          <BodyText tone="secondary">
            <PageLink
              to={taskCardPath(place.org, place.contest, place.task, other.card)}
            >
              {other.card === 'tests'
                ? 'Go to Tests and scoring'
                : 'Go to the task’s page'}
            </PageLink>
          </BodyText>
        )}
        <div className={shared.actions}>
          <Button
            type="submit"
            loading={busy}
            disabled={file === null || target === '' || other !== null || held !== null}
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
