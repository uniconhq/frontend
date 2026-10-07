import { useMemo, useState, type ReactNode } from 'react';
import { formatSize } from '@/lib/size';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import type { Place } from './place';
import { useSaveUploads, type ArrivedUpload } from './upload-save';
import { UploadSaveAnswer } from './UploadSaveAnswer';
import { WaitingContext, useWaitingUploads, type Waiting } from './waiting-uploads';
import shared from '../organise.module.css';
import classes from './Files.module.css';

type TaskPlace = Extract<Place, { kind: 'task' }>;

/** Keeps the page's waiting uploads for every view of a task's files under it. */
export function WaitingUploadsProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<ArrivedUpload[]>([]);
  const [held, setHeld] = useState(0);
  const waiting = useMemo<Waiting>(
    () => ({
      uploads,
      keep: (upload) =>
        setUploads((before) => [
          ...before.filter((kept) => kept.path !== upload.path),
          upload,
        ]),
      discard: (path) =>
        setUploads((before) => before.filter((kept) => kept.path !== path)),
      saved: (paths) =>
        setUploads((before) => before.filter((kept) => !paths.includes(kept.path))),
      held,
      hold: (on) => setHeld((before) => Math.max(0, before + (on ? 1 : -1))),
    }),
    [uploads, held],
  );
  return <WaitingContext.Provider value={waiting}>{children}</WaitingContext.Provider>;
}

/**
 * The uploads waiting to be saved, each with its path and size and a way to
 * discard it, and Save into the task, which saves them all in one save. While
 * an upload form holds an arrived upload, its own Save takes these with it,
 * so this one steps aside.
 */
export function WaitingUploads({ place }: { place: TaskPlace }) {
  const waiting = useWaitingUploads();
  const saving = useSaveUploads(place, (paths) => waiting?.saved(paths));
  if (waiting === null || (waiting.uploads.length === 0 && saving.outcome === null)) {
    return null;
  }
  const { uploads } = waiting;

  return (
    <section className={classes.upload} aria-label="Waiting to be saved">
      {uploads.length > 0 && (
        <>
          <BodyText>
            {uploads.length === 1
              ? 'One upload is waiting to be saved into the task.'
              : `${String(uploads.length)} uploads are waiting to be saved into the task, together.`}
          </BodyText>
          <ul className={classes.waiting} aria-label="Uploads waiting to be saved">
            {uploads.map((upload) => (
              <li key={upload.path}>
                <span className={shared.mono}>{upload.path}</span>
                {upload.size !== null && (
                  <BodyText tone="secondary">{formatSize(upload.size)}</BodyText>
                )}
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={saving.pending}
                  onClick={() => waiting.discard(upload.path)}
                  label={`Discard ${upload.path}`}
                >
                  Discard
                </Button>
              </li>
            ))}
          </ul>
          <BodyText tone="secondary">
            They are kept on this page only: leaving or reloading it drops them, and the
            task has none of them until they are saved. Saving them is one save of the
            task, which publishes or keeps a draft.
          </BodyText>
          {waiting.held > 0 ? (
            <BodyText tone="secondary">
              Saving the upload that has arrived above saves these with it.
            </BodyText>
          ) : (
            <div className={shared.actions}>
              <Button
                loading={saving.pending}
                onClick={() => {
                  saving.forget();
                  void saving.save(uploads);
                }}
              >
                Save into the task
              </Button>
            </div>
          )}
        </>
      )}
      <UploadSaveAnswer saving={saving} />
    </section>
  );
}
