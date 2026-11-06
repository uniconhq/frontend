import type { ApiError } from '@/api/problem';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import type { PlaceOf } from '../DefinitionErrors';
import { formatSize } from '@/lib/size';
import { FilesMerge } from './FilesMerge';
import type { Place } from './place';
import { SaveOutcome } from './SaveOutcome';
import type { useSaveUploads } from './upload-save';
import shared from '../organise.module.css';

/**
 * The refusals of an upload itself, said on their own rather than as a
 * save's outcome: an upload the forge would not take for this path, one
 * whose bytes it has not got, and one that did not go through.
 */
const UPLOAD_REFUSED = new Set(['invalid_inputs', 'upload_not_ready', 'upload_failed']);

export function Refused({ error }: { error: ApiError }) {
  return (
    <div className={shared.panel} role="alert">
      <ErrorBlock error={error} compact heading="Couldn’t upload" />
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
  if (outcome.kind === 'refused' && UPLOAD_REFUSED.has(outcome.error.code)) {
    return <Refused error={outcome.error} />;
  }
  if (outcome.kind === 'refused' && outcome.error.code === 'conflict') {
    const { body } = outcome;
    return (
      <FilesMerge
        place={place}
        files={body.changes.map((change) => ({
          path: change.path,
          // In the words of the page it is changed on, "Statement", not its path.
          label: placeOf === undefined ? change.path : placeOf([change.path], '').label,
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
      onConfirm={(body, asked) => void send({ ...body, confirm: true, asked })}
      onKeepAsDraft={(body) => void send({ ...body, keep_as_draft: true })}
      onReload={() => undefined}
      placeOf={placeOf}
    />
  );
}
