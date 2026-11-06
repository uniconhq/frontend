import { useQueryClient } from '@tanstack/react-query';
import { $api, isRefused, queryView } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { Chip } from '@/ui/Chip';
import { ListCard, type ListRow } from '@/ui/ListCard';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import {
  STANDING_WORD,
  byWhatMattersNow,
  datesLine,
  standingOf,
} from '@/lib/contest-state';
import { contestPath } from '@/lib/organiser-paths';
import { serverNow } from '@/lib/time';
import { useNamedContests } from '@/session';
import { CreateButton } from '../Create';
import { useOrgMay } from '../may';

const CONTESTS = '/api/v1/orgs/{org}/contests';

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
 * the bottom when the server says the caller may make one. Someone refused
 * the list sees, by name, the contests `me` names.
 */
export function OrgContests({ org }: { org: string }) {
  const manages = useOrgMay(org).create_contest;
  const queryClient = useQueryClient();
  const listKey = $api.queryOptions('get', CONTESTS, {
    params: { path: { org } },
  }).queryKey;
  const view = queryView($api.useQuery('get', CONTESTS, { params: { path: { org } } }));
  const named = useNamedContests(org);
  const refused = isRefused(view);
  const create = $api.useMutation('post', CONTESTS, {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  const now = serverNow();
  const rows: ListRow[] =
    view.state === 'ready'
      ? byWhatMattersNow(
          view.data.map((listed) => ({ name: listed.name, contest: datedOf(listed) })),
          now,
        ).map(({ name, contest }) => ({
          key: name,
          to: contestPath(org, name),
          name,
          text: name,
          detail:
            contest === null ? (
              <BodyText tone="secondary">Its settings cannot be read</BodyText>
            ) : (
              <Standing contest={contest} />
            ),
        }))
      : refused
        ? named.map((name) => ({
            key: name,
            to: contestPath(org, name),
            name,
            text: name,
          }))
        : [];

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
              <BodyText>Contests of this org where you have a role:</BodyText>
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
              description:
                'Shown on the contest’s pages. Left empty, its name is shown.',
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
