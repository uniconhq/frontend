import type { ApiError } from '@/api/problem';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
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
 * a conflict on a path with the offer to save over it, or any other answer
 * as a file's save shows it.
 */
export function UploadSaveAnswer({
  saving,
}: {
  saving: ReturnType<typeof useSaveUploads>;
}) {
  const { outcome, send, saveOver, pending } = saving;
  if (outcome === null) return null;
  if (outcome.kind === 'refused' && UPLOAD_REFUSED[outcome.error.code] !== undefined) {
    return <Refused error={outcome.error} />;
  }
  if (outcome.kind === 'refused' && outcome.error.code === 'conflict') {
    const paths = outcome.body.changes.map((change) => change.path);
    return (
      <div className={shared.panel} role="alert">
        <BodyText>
          {paths.length === 1 ? (
            <>
              Someone else changed <span className={shared.mono}>{paths[0]}</span> since
              the upload began.
            </>
          ) : (
            <>
              Someone else changed one of{' '}
              <span className={shared.mono}>{paths.join(', ')}</span> since its upload
              began.
            </>
          )}
        </BodyText>
        <BodyText tone="secondary">
          Nothing was saved. Saving again replaces their version with{' '}
          {paths.length === 1 ? 'this upload' : 'these uploads'}.
        </BodyText>
        <div className={shared.actions}>
          <Button
            size="xs"
            variant="secondary"
            loading={pending}
            onClick={() => void saveOver(outcome.body)}
          >
            Save over their version
          </Button>
        </div>
      </div>
    );
  }
  return (
    <SaveOutcome
      outcome={outcome}
      onConfirm={(body) => void send({ ...body, confirm: true })}
      onKeepAsDraft={(body) => void send({ ...body, keep_as_draft: true })}
      onReload={() => undefined}
    />
  );
}
