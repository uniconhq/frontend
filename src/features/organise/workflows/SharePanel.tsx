import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { Visibility, WorkflowPage } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { RadioGroup } from '@/ui/RadioGroup';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import classes from './workflows.module.css';

/**
 * Who reads a workflow: private, its owner alone; shared, the owner and the
 * people on its list; public, everyone. Shared is private with a list, so
 * choosing it before anyone is on the list leaves it read by its owner
 * alone until someone is added. Making it private or public empties the
 * list, which this panel says before it does.
 */
export function SharePanel({ page }: { page: WorkflowPage }) {
  const { owner, name } = page;
  const queryClient = useQueryClient();
  const pageKey = $api.queryOptions('get', '/api/v1/workflows/{owner}/{name}', {
    params: { path: { owner, name } },
  }).queryKey;
  const [chosen, setChosen] = useState<Visibility>(page.visibility);
  const [shownVisibility, setShownVisibility] = useState(page.visibility);
  if (shownVisibility !== page.visibility) {
    setShownVisibility(page.visibility);
    setChosen(page.visibility);
  }
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

  const listed = page.readers.length > 0;
  return (
    <section className={classes.stack} aria-label="Who reads it">
      <SectionTitle order={3}>Who reads it</SectionTitle>
      <RadioGroup
        label="Visibility"
        value={chosen}
        options={[
          { value: 'private', label: 'Private: only its owner' },
          { value: 'shared', label: 'Shared with the people listed' },
          { value: 'public', label: 'Public: everyone' },
        ]}
        description={
          listed && chosen !== 'shared'
            ? `Making it ${chosen} takes it from the ${String(page.readers.length)} people it is shared with.`
            : undefined
        }
        onChange={(value) => setChosen(value as Visibility)}
      />
      {chosen !== page.visibility && (
        <div>
          <Button
            size="xs"
            loading={visibility.isPending}
            onClick={() =>
              void run(() =>
                visibility.mutateAsync({
                  params: { path: { owner, name } },
                  body: { visibility: chosen },
                }),
              )
            }
          >
            Make it {chosen}
          </Button>
        </div>
      )}
      {chosen === 'shared' && (
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
              Shared with nobody yet, so only its owner reads it.
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
      {error !== null && <ErrorBlock error={error} />}
    </section>
  );
}
