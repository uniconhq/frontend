import type { ApiError } from '@/api/problem';
import { BodyText } from '@/ui/BodyText';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import type { PlaceOf } from '../DefinitionErrors';
import { formatSize } from '@/lib/size';
import { FilesMerge } from './FilesMerge';
import type { Place } from './place';
import { SaveOutcome } from './SaveOutcome';
import type { useSaveUploads } from './upload-save';
import shared from '../organise.module.css';

/**
 * The words for a refusal an organiser's upload or its save can meet that
 * the app otherwise words for a contestant: an upload the forge would not
 * take for this path, or one whose bytes it has not got.
 */
const UPLOAD_REFUSED: Partial<Record<string, { title: string; message: string }>> = {
  invalid_inputs: {
    title: 'The upload was made for another place',
    message: 'Nothing was saved. Upload the file again for the place it is to go.',
  },
  upload_not_ready: {
    title: 'The file did not arrive in full',
    message: 'Nothing was saved. Upload it again.',
  },
  upload_failed: {
    title: 'The upload did not go through',
    message:
      'It was sent again from the start and still did not arrive, or the file changed since it was chosen. Nothing was saved; upload it again.',
  },
};

export function Refused({ error }: { error: ApiError }) {
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

/**
 * What a save of uploads came back with: a refusal of the upload in words,
 * a conflict shown file by file, whose each is now, to keep or save over
 * (M27), or any other answer
 * as a file's save shows it.
 */
export function UploadSaveAnswer({
  place,
  saving,
  placeOf,
}: {
  place: Extract<Place, { kind: 'task' }>;
  saving: ReturnType<typeof useSaveUploads>;
  /** Where each problem of a save kept as a draft is fixed. */
  placeOf?: PlaceOf;
}) {
  const { outcome, send, saveOver, pending, forget } = saving;
  const sizeOf = (path: string) => {
    const size = saving.sizeOf(path);
    return size === null ? '' : `, ${formatSize(size)}`;
  };
  if (outcome === null) return null;
  if (outcome.kind === 'refused' && UPLOAD_REFUSED[outcome.error.code] !== undefined) {
    return <Refused error={outcome.error} />;
  }
  if (outcome.kind === 'refused' && outcome.error.code === 'conflict') {
    const { body } = outcome;
    return (
      <FilesMerge
        place={place}
        files={body.changes.map((change) => ({
          path: change.path,
          label: change.path,
          mine: `Your upload${sizeOf(change.path)}`,
        }))}
        busy={pending}
        onSave={(overwrite) => void saveOver(body, overwrite)}
        onDrop={forget}
      />
    );
  }
  return (
    <SaveOutcome
      outcome={outcome}
      onConfirm={(body) => void send({ ...body, confirm: true })}
      onKeepAsDraft={(body) => void send({ ...body, keep_as_draft: true })}
      onReload={() => undefined}
      placeOf={placeOf}
    />
  );
}
