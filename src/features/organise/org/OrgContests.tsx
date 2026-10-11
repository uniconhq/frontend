import type { ReactNode } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { Chip } from '@/ui/Chip';
import { ListCard, type ListRow } from '@/ui/ListCard';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { Loaded } from '@/ui/feedback/Loaded';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import {
  STANDING_WORD,
  byWhatMattersNow,
  datesLine,
  standingOf,
} from '@/lib/contest-state';
import { contestPath } from '@/lib/organiser-paths';
import { serverNow } from '@/lib/time';
import { CreateButton } from '../Create';
import { contestsReached, holdsAt } from '../roles';

const CONTESTS = '/api/v1/orgs/{org}/contests';
const HOME = '/api/v1/orgs/{org}/contests/{contest}/home';

type Dated = Parameters<typeof standingOf>[0];

/** A contest's state and the date that matters. */
function Standing({ contest }: { contest: Dated }) {
  const now = serverNow();
  const standing = standingOf(contest, now);
  return (
    <>
      <Chip tone={standing === 'live' ? 'live' : 'quiet'}>
        {STANDING_WORD[standing]}
      </Chip>
      <span>{datesLine(contest, now)}</span>
    </>
  );
}

/** The state and dates the list gives, or null for a contest whose settings do not read. */
function datedOf(listed: {
  state: Dated['state'] | null;
  start: string | null;
  end: string | null;
}): Dated | null {
  const { state, start, end } = listed;
  return state === null || start === null || end === null
    ? null
    : { state, start, end };
}

/**
 * An org's contests as a list card, those running now first, each row its
 * state and the date that matters, as the list gives them; "New contest" at
 * the bottom for a manager of the org. Listing needs the observer role at
 * the org: someone who holds a role only at one of its contests or tasks is
 * refused the list, so the refusal comes with the contests their own roles
 * reach, each read from its home, and the way down still works.
 */
export function OrgContests({ org }: { org: string }) {
  const roles = useMe().roles;
  const manages = holdsAt(roles, { kind: 'org', org }, 'manager');
  const queryClient = useQueryClient();
  const listKey = $api.queryOptions('get', CONTESTS, {
    params: { path: { org } },
  }).queryKey;
  const view = queryView($api.useQuery('get', CONTESTS, { params: { path: { org } } }));
  const create = $api.useMutation('post', CONTESTS, {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  const reached = view.state === 'error' ? contestsReached(roles, org) : [];
  const homes = useQueries({
    queries: reached.map((contest) =>
      $api.queryOptions('get', HOME, { params: { path: { org, contest } } }),
    ),
  });
  const now = serverNow();
  const rowOf = (name: string, detail: ReactNode): ListRow => ({
    key: name,
    to: contestPath(org, name),
    name,
    text: name,
    detail,
  });
  const rows: ListRow[] =
    view.state === 'ready'
      ? byWhatMattersNow(
          view.data.map((listed) => ({ name: listed.name, contest: datedOf(listed) })),
          now,
        ).map(({ name, contest }) =>
          rowOf(
            name,
            contest === null ? (
              <BodyText tone="secondary">Its settings do not read</BodyText>
            ) : (
              <Standing contest={contest} />
            ),
          ),
        )
      : byWhatMattersNow(
          reached.map((name, at) => ({ name, contest: homes[at]?.data ?? null, at })),
          now,
        ).map(({ name, at }) => {
          const home = homes[at];
          return rowOf(
            name,
            home === undefined ? undefined : (
              <Loaded view={queryView(home)} compact>
                {(found) => <Standing contest={found} />}
              </Loaded>
            ),
          );
        });

  return (
    <ListCard
      title="Contests"
      rows={rows}
      empty="No contests yet."
      notice={
        view.state === 'error' && (
          <>
            <ErrorBlock error={view.error} onRetry={view.retry} />
            {rows.length > 0 && (
              <BodyText>Contests of this org you hold a role at:</BodyText>
            )}
          </>
        )
      }
      body={
        view.state === 'loading' ? (
          <PageSkeleton rows={3} />
        ) : view.state === 'error' && rows.length === 0 ? (
          <></>
        ) : undefined
      }
      action={
        manages ? (
          <CreateButton
            openLabel="New contest"
            second={{
              label: 'Title',
              description: 'Shown on its pages. Its name is used when there is none.',
            }}
            submitLabel="Create contest"
            pending={create.isPending}
            error={create.error}
            onOpen={create.reset}
            onSubmit={async (name, title) => {
              await create.mutateAsync({
                params: { path: { org } },
                body: { name, title: title === '' ? null : title },
              });
            }}
          />
        ) : undefined
      }
    />
  );
}
