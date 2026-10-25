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
 * back, and the buttons that ask first.
 */
export function ResultsControls({ path, manager }: { path: Path; manager: boolean }) {
  const view = queryView($api.useQuery('get', TASK, { params: { path } }));
  const [results, setResults] = useState<Results | null>(null);
  if (view.state === 'loading' || view.state === 'error') return null;
  const found = view.data.results;
  if (found === undefined) return null;
  const shown = results ?? found;
  return (
    <div className={classes.stack}>
      <BodyText>
        {shown.released ? 'Results are released.' : 'Results are not released.'}
      </BodyText>
      <History history={shown.history} />
      {manager && (
        <Ask
          path={path}
          released={shown.released}
          onDone={setResults}
        />
      )}
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
  onDone: (results: Results) => void;
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
        onSuccess: (data) => {
          setAsking(null);
          onDone(data);
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
      <Modal opened={asking !== null} onClose={() => setAsking(null)} title={released ? 'Take back' : 'Release results'}>
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
