import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { Visibility, WorkflowPage } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { RadioGroup } from '@/ui/RadioGroup';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import classes from './workflows.module.css';

const OPTIONS = [
  {
    value: 'private',
    label: 'Private',
    description: 'Only its owner can see it and choose it for a task.',
  },
  {
    value: 'shared',
    label: 'Shared',
    description: 'Its owner and the people listed here can see it and choose it.',
  },
  {
    value: 'public',
    label: 'Public',
    description: 'Everyone with an account can see it and choose it.',
  },
];

/**
 * Who reads a workflow, applied as it is chosen (M32): private, its owner
 * alone; shared, the owner and the people on its list; public, everyone.
 * Choosing private or public when people are on the list takes it from them,
 * so that choice asks first; every other choice applies at once.
 */
function SharePanel({ page }: { page: WorkflowPage }) {
  const { owner, name } = page;
  const queryClient = useQueryClient();
  const pageKey = $api.queryOptions('get', '/api/v1/workflows/{owner}/{name}', {
    params: { path: { owner, name } },
  }).queryKey;
  const [asking, setAsking] = useState<Visibility | null>(null);
  const [reader, setReader] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const visibility = $api.useMutation(
    'put',
    '/api/v1/workflows/{owner}/{name}/visibility',
  );
  const share = $api.useMutation(
    'put',
    '/api/v1/workflows/{owner}/{name}/readers/{username}',
  );
  const unshare = $api.useMutation(
    'delete',
    '/api/v1/workflows/{owner}/{name}/readers/{username}',
  );

  const run = async (call: () => Promise<unknown>) => {
    setError(null);
    try {
      await call();
      await queryClient.invalidateQueries({ queryKey: pageKey });
      return true;
    } catch (caught) {
      setError(toApiError(caught));
      return false;
    }
  };
  const apply = (chosen: Visibility) => {
    setAsking(null);
    void run(() =>
      visibility.mutateAsync({
        params: { path: { owner, name } },
        body: { visibility: chosen },
      }),
    );
  };

  const listed = page.readers.length > 0;
  return (
    <section className={classes.stack} aria-label="Who can see it">
      <RadioGroup
        label="Who can see it"
        value={asking ?? page.visibility}
        options={OPTIONS}
        disabled={visibility.isPending}
        onChange={(value) => {
          const chosen = value as Visibility;
          if (chosen === page.visibility) setAsking(null);
          else if (listed && chosen !== 'shared') setAsking(chosen);
          else apply(chosen);
        }}
      />
      {asking !== null && (
        <div className={classes.stack} role="alert">
          <BodyText size="sm">
            Making it {asking} stops sharing it with the {String(page.readers.length)}{' '}
            {page.readers.length === 1 ? 'person' : 'people'} it is shared with.
          </BodyText>
          <div className={classes.actions}>
            <Button size="xs" onClick={() => apply(asking)}>
              Make it {asking}
            </Button>
            <Button size="xs" variant="secondary" onClick={() => setAsking(null)}>
              Keep it shared
            </Button>
          </div>
        </div>
      )}
      {page.visibility === 'shared' && asking === null && (
        <>
          {listed ? (
            <ul className={classes.list} aria-label="Shared with">
              {page.readers.map((username) => (
                <li key={username} className={classes.item}>
                  <BodyText size="sm">{username}</BodyText>
                  <Button
                    size="xs"
                    variant="secondary"
                    label={`Stop sharing with ${username}`}
                    loading={unshare.isPending}
                    onClick={() =>
                      void run(() =>
                        unshare.mutateAsync({
                          params: { path: { owner, name, username } },
                        }),
                      )
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <BodyText size="sm" tone="secondary">
              Shared with nobody yet, so only its owner can see it.
            </BodyText>
          )}
          <form
            className={classes.item}
            aria-label="Share it with someone"
            onSubmit={(event) => {
              event.preventDefault();
              const username = reader.trim();
              if (username === '') return;
              void run(() =>
                share.mutateAsync({ params: { path: { owner, name, username } } }),
              ).then((done) => {
                if (done) setReader('');
              });
            }}
          >
            <TextInput label="Username" value={reader} onChange={setReader} />
            <Button size="xs" type="submit" loading={share.isPending}>
              Share
            </Button>
          </form>
        </>
      )}
      {error !== null && <ErrorBlock error={error} compact />}
    </section>
  );
}

/** "Share" on a workflow's bar, which opens who reads it in a dialog. */
export function ShareButton({ page }: { page: WorkflowPage }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Share
      </Button>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title={`Share ${page.owner}/${page.name}`}
      >
        {open && <SharePanel page={page} />}
      </Modal>
    </>
  );
}
