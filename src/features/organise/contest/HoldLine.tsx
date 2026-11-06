import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { isApiError } from '@/api/problem';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { formatDateTime } from '@/lib/time';
import { usePlaceMay } from '../may';
import classes from '../organise.module.css';

type Path = { org: string; contest: string };

const HOLD = '/api/v1/orgs/{org}/contests/{contest}/hold';
const END = '/api/v1/orgs/{org}/contests/{contest}/hold/end';

/** Where the contest's hold stands, and the button that ends it. */
export function HoldLine({ path }: { path: Path }) {
  const view = queryView($api.useQuery('get', HOLD, { params: { path } }));
  const manager = usePlaceMay({ kind: 'contest', ...path }).manage;
  if (view.state === 'loading') return null;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} compact />;
  const hold = view.data;
  if (hold.from === null) return <BodyText>No freeze.</BodyText>;
  const until =
    hold.until === 'staff'
      ? 'until an organiser ends it'
      : hold.until === null
        ? ''
        : `until ${formatDateTime(new Date(hold.until))}`;
  return (
    <div className={classes.stack}>
      <BodyText>
        {hold.holding ? 'Frozen' : 'Not frozen'} from{' '}
        {formatDateTime(new Date(hold.from))} {until}
      </BodyText>
      {hold.ended_at !== null && (
        <BodyText tone="secondary">
          Ended{hold.ended_by_name !== null ? ` by ${hold.ended_by_name}` : ''}{' '}
          {formatDateTime(new Date(hold.ended_at))}
        </BodyText>
      )}
      {manager && hold.holding && <EndHold path={path} />}
    </div>
  );
}

function EndHold({ path }: { path: Path }) {
  const queryClient = useQueryClient();
  const end = $api.useMutation('post', END);
  const [asking, setAsking] = useState<string | null>(null);
  const [failed, setFailed] = useState<unknown>(null);
  const run = (confirm: boolean) => {
    setFailed(null);
    end.mutate(
      { params: { path }, body: { confirm } },
      {
        onSuccess: () => {
          setAsking(null);
          void queryClient.invalidateQueries({
            queryKey: $api.queryOptions('get', HOLD, { params: { path } }).queryKey,
          });
        },
        onError: (error) => {
          if (!confirm && isApiError(error) && error.code === 'confirmation_required') {
            setAsking(error.detail ?? 'End the freeze now?');
            return;
          }
          setFailed(error);
        },
      },
    );
  };
  return (
    <>
      <Button variant="secondary" loading={end.isPending} onClick={() => run(false)}>
        End the freeze now
      </Button>
      {failed !== null && (
        <ErrorBlock error={failed} compact heading="Couldn’t change the freeze" />
      )}
      <ConfirmDialog
        opened={asking !== null}
        onClose={() => setAsking(null)}
        title="End the freeze now"
        confirm="End the freeze now"
        loading={end.isPending}
        onConfirm={() => run(true)}
      >
        <BodyText>{asking}</BodyText>
      </ConfirmDialog>
    </>
  );
}
