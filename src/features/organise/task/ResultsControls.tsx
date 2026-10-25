import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { $api, queryView } from '@/api/query';
import { isApiError } from '@/api/problem';
import type { components } from '@/api/schema';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { formatDateTime } from '@/lib/time';
import classes from '../organise.module.css';

type Results = components['schemas']['Results'];
type Path = { org: string; contest: string; task: string };

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}';
const RELEASE = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/results/release';
const HIDE = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/results/hide';

/**
 * Whether a run task's results are released, who released or took them
 * back, and the buttons that ask first. A release or a take-back reads the
 * task again, so what is shown is always the task's own.
 */
export function ResultsControls({ path, manager }: { path: Path; manager: boolean }) {
  const queryClient = useQueryClient();
  const view = queryView($api.useQuery('get', TASK, { params: { path } }));
  if (view.state === 'loading' || view.state === 'error') return null;
  const shown = view.data.results;
  if (shown === undefined) return null;
  const done = () => {
    void queryClient.invalidateQueries({
      queryKey: $api.queryOptions('get', TASK, { params: { path } }).queryKey,
    });
  };
  return (
    <div className={classes.stack}>
      <BodyText>
        {shown.released ? 'Results are released.' : 'Results are not released.'}
      </BodyText>
      <History history={shown.history} />
      {manager && <Ask path={path} released={shown.released} onDone={done} />}
    </div>
  );
}

function History({ history }: { history: Results['history'] }) {
  if (history.length === 0) return null;
  return (
    <ul aria-label="Results history">
      {history.map((item) => (
        <li key={`${item.action}:${item.at}`}>
          {item.action === 'released' ? 'Released' : 'Taken back'}
          {item.by_name !== null ? ` by ${item.by_name}` : ''}{' '}
          {formatDateTime(new Date(item.at))}
        </li>
      ))}
    </ul>
  );
}

function Ask({
  path,
  released,
  onDone,
}: {
  path: Path;
  released: boolean;
  onDone: () => void;
}) {
  const release = $api.useMutation('post', RELEASE);
  const hide = $api.useMutation('post', HIDE);
  const [asking, setAsking] = useState<string | null>(null);
  const [failed, setFailed] = useState<unknown>(null);
  const pending = release.isPending || hide.isPending;
  const send = released ? hide : release;
  const run = (confirm: boolean) => {
    setFailed(null);
    send.mutate(
      { params: { path }, body: { confirm } },
      {
        onSuccess: () => {
          setAsking(null);
          onDone();
        },
        onError: (error) => {
          if (!confirm && isApiError(error) && error.code === 'confirmation_required') {
            setAsking(error.detail ?? 'Confirm this.');
            return;
          }
          setFailed(error);
        },
      },
    );
  };
  return (
    <>
      <div className={classes.actions}>
        <Button variant="secondary" loading={pending} onClick={() => run(false)}>
          {released ? 'Take back' : 'Release results'}
        </Button>
      </div>
      {failed !== null && <ErrorBlock error={failed} />}
      <Modal
        opened={asking !== null}
        onClose={() => setAsking(null)}
        title={released ? 'Take back' : 'Release results'}
      >
        <div className={classes.stack}>
          <BodyText>{asking}</BodyText>
          <div className={classes.actions}>
            <Button loading={pending} onClick={() => run(true)}>
              {released ? 'Take back' : 'Release results'}
            </Button>
            <Button variant="secondary" onClick={() => setAsking(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
