import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/ui/Button';
import { useQueryClient } from '@tanstack/react-query';
import {
  partUploadsQuery,
  abortPartUpload,
  sendingHereNow,
  watchSendingHere,
  type MultipartPlace,
  type PartTransfer,
} from '@/api/upload/parts';
import { toApiError } from '@/api/problem';
import { BodyText } from '@/ui/BodyText';
import { FileDrop } from '@/ui/FileDrop';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { formatSize } from '@/lib/size';
import shared from '../organise.module.css';
import { useOpenUploads } from './use-open-uploads';

/**
 * The server remembers parts; the browser asks for the original file again.
 * An upload this tab is still sending is left out: the page sending it shows
 * how far it has got, and a second sender or a cancel here would cut it.
 * Cancelling an upload whose every part has arrived asks first, as it throws
 * the whole file away; a refused one is only dismissed.
 */
export function OpenUploads({
  place,
  disabled,
  onChoose,
  onStored,
  onAborted,
}: {
  place: MultipartPlace;
  disabled: boolean;
  onChoose: (transfer: PartTransfer, file: File) => Promise<unknown>;
  onStored: (transfer: PartTransfer) => Promise<unknown>;
  onAborted: (id: string) => void;
}) {
  const [error, setError] = useState<unknown>(null);
  const [working, setWorking] = useState(false);
  /** The upload whose cancelling is being asked about. */
  const [asking, setAsking] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const here = useSyncExternalStore(watchSendingHere, sendingHereNow);
  const options = partUploadsQuery(place);
  const query = useOpenUploads(place);
  const run = async (work: () => Promise<unknown>) => {
    if (working || disabled) return;
    setWorking(true);
    setError(null);
    try {
      await work();
    } catch (error) {
      setError(error);
    } finally {
      setWorking(false);
      void query.refetch();
    }
  };
  // An upload this tab stops sending may be left open to resume: read again.
  const { refetch } = query;
  const seen = useRef(here);
  useEffect(() => {
    if (seen.current === here) return;
    seen.current = here;
    void refetch();
  }, [here, refetch]);
  if (query.error !== null)
    return (
      <ErrorBlock
        error={toApiError(query.error)}
        compact
        onRetry={() => void query.refetch()}
      />
    );
  const rows = (query.data ?? []).filter((row) => !here.has(row.id));
  if (rows.length === 0) return null;
  return (
    <section aria-label="Unfinished uploads">
      <BodyText>Unfinished uploads</BodyText>
      {error !== null && <ErrorBlock error={toApiError(error)} compact />}
      {rows.map((row) => {
        const cancel = () =>
          void run(async () => {
            setAsking(null);
            await abortPartUpload(place, row.id);
            queryClient.setQueryData<PartTransfer[]>(options.queryKey, (rows) =>
              rows?.filter((current) => current.id !== row.id),
            );
            onAborted(row.id);
          });
        const whole = row.status === 'stored' || row.status === 'finishing';
        return (
          <div key={row.id}>
            {asking === row.id ? (
              <div className={shared.panel} role="alert">
                <BodyText>
                  All {formatSize(row.size)} of{' '}
                  <span className={shared.mono}>{row.path}</span> has been sent.
                  Cancelling throws it away, and it would have to be sent again from the
                  start.
                </BodyText>
                <div className={shared.actions}>
                  <Button
                    size="xs"
                    variant="danger"
                    disabled={disabled || working}
                    onClick={cancel}
                  >
                    Throw it away
                  </Button>
                  <Button size="xs" variant="secondary" onClick={() => setAsking(null)}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="secondary"
                disabled={disabled || working}
                onClick={() => (whole ? setAsking(row.id) : cancel())}
              >
                {row.status === 'refused' ? 'Dismiss' : 'Cancel upload of'} {row.path}
              </Button>
            )}
            {row.status === 'refused' ? (
              <BodyText>
                {row.path}: {row.reason ?? 'The upload was interrupted; send it again.'}
              </BodyText>
            ) : row.status === 'stored' ? (
              <>
                <BodyText>{row.path}: uploaded, waiting for Save</BodyText>
                <Button
                  disabled={disabled || working}
                  onClick={() => void run(() => onStored(row))}
                >
                  Use uploaded {row.path}
                </Button>
              </>
            ) : row.status === 'finishing' ? (
              <BodyText>{row.path}: finishing upload…</BodyText>
            ) : (
              <FileDrop
                label={`Resume ${row.path}`}
                description="Choose the same file to send only its missing parts. It is checked again before continuing."
                files={[]}
                disabled={disabled || working}
                onChange={(files) => {
                  const file = files[0];
                  if (file !== undefined) void run(() => onChoose(row, file));
                }}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}
