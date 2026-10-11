import { useQueries, useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import type { ContestHome } from '@/api/types';
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

/** A contest's state and the date that matters, once its home has been read. */
function Standing({ home }: { home: ContestHome }) {
  const now = serverNow();
  const standing = standingOf(home, now);
  return (
    <>
      <Chip tone={standing === 'live' ? 'live' : 'quiet'}>
        {STANDING_WORD[standing]}
      </Chip>
      <span>{datesLine(home, now)}</span>
    </>
  );
}

/**
 * An org's contests as a list card, those running now first, each row its
 * state and the date that matters, read from each contest's home; "New
 * contest" at the bottom for a manager of the org. Listing needs the
 * observer role at the org: someone who holds a role only at one of its
 * contests or tasks is refused the list, so the refusal comes with the
 * contests their own roles reach, and the way down still works.
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

  const names =
    view.state === 'ready'
      ? view.data.map((contest) => contest.name)
      : view.state === 'error'
        ? contestsReached(roles, org)
        : [];
  const homes = useQueries({
    queries: names.map((contest) =>
      $api.queryOptions('get', HOME, { params: { path: { org, contest } } }),
    ),
  });
  const now = serverNow();
  const rows: ListRow[] = byWhatMattersNow(
    names.map((name, at) => ({ name, contest: homes[at]?.data ?? null, at })),
    now,
  ).map(({ name, at }) => {
    const home = homes[at];
    return {
      key: name,
      to: contestPath(org, name),
      name,
      text: name,
      detail:
        home === undefined ? undefined : (
          <Loaded view={queryView(home)} compact>
            {(found) => <Standing home={found} />}
          </Loaded>
        ),
    };
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
            {names.length > 0 && (
              <BodyText>Contests of this org you hold a role at:</BodyText>
            )}
          </>
        )
      }
      body={
        view.state === 'loading' ? (
          <PageSkeleton rows={3} />
        ) : view.state === 'error' && names.length === 0 ? (
          <></>
        ) : undefined
      }
      action={
        manages ? (
          <CreateButton
            openLabel="New contest"
            second={{
              label: 'Title',
              description: 'Shown to contestants. The name is used when there is none.',
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
