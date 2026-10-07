import { useState } from 'react';
import type { UploadInfo } from '@/api/types';
import { useMe } from '@/session';
import { formatSize } from '@/lib/size';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { holdsAt } from '../roles';
import type { Place } from './place';
import { TaskUpload } from './TaskUpload';
import shared from '../organise.module.css';
import classes from './Files.module.css';

/**
 * A file that is an upload: what it holds, its size and SHA-256, and never
 * an editor, since its commit holds a pointer to the bytes and typing over it
 * would commit text where the pointer belongs. Every view of a file shows an
 * upload this way: the file editor, the statement, the settings forms and an
 * older version in the history.
 *
 * The file as it is now carries the `token` it was read with, and a manager
 * of the task changes it by uploading it again at the same path with that
 * token. An older version has none: it is only read.
 */
export function UploadedFile({
  place,
  path,
  upload,
  token,
  label = `Uploaded ${path}`,
}: {
  place: Place;
  path: string;
  upload: UploadInfo;
  /** The token the file was read at, or null for an older version. */
  token: string | null;
  /** What the section is named, such as the version it is the file at. */
  label?: string;
}) {
  const roles = useMe().roles;
  const [again, setAgain] = useState(false);
  const manages =
    token !== null && place.kind === 'task' && holdsAt(roles, place, 'manager');

  return (
    <section className={classes.editor} aria-label={label}>
      <BodyText mono>{path}</BodyText>
      <dl className={classes.facts}>
        <dt>Uploaded file</dt>
        <dd>
          {formatSize(upload.size)}
          {upload.size >= 1024 && ` (${upload.size.toLocaleString()} bytes)`}
        </dd>
        <dt>SHA-256</dt>
        <dd className={classes.digest}>{upload.digest}</dd>
      </dl>
      <BodyText tone="secondary">
        Its bytes are in the forge&apos;s store and its commit holds a pointer to them,
        so it does not open as text.
        {token !== null && ' To change it, upload it again.'}
      </BodyText>
      {manages && !again && (
        <div className={shared.actions}>
          <Button size="xs" variant="secondary" onClick={() => setAgain(true)}>
            Upload again
          </Button>
        </div>
      )}
      {place.kind === 'task' && token !== null && again && (
        <TaskUpload
          place={place}
          again={{ path, token }}
          onClose={() => setAgain(false)}
        />
      )}
    </section>
  );
}
