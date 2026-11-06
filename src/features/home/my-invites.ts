import type { RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChange } from '@/api/change';
import { $api } from '@/api/query';
import type { Entered, Invite } from '@/api/types';

const MINE = '/api/v1/me/invites';
const OPEN = '/api/v1/me/invites/open';

const LAPSED = new Set(['invite_expired']);

export function useMyInvites() {
  return $api.useQuery('get', MINE);
}

/**
 * Accept or decline, leaving the answer in the invite's place so the card says
 * what came of it. An accepted role rereads the session, since roles decide
 * what every page offers.
 */
export function useDecide(
  card: RefObject<HTMLElement | null>,
  onEntered: (entered: Entered) => void = () => {},
) {
  const queryClient = useQueryClient();
  const accept = $api.useMutation('post', '/api/v1/me/invites/{invite_id}/accept');
  const decline = $api.useMutation('post', '/api/v1/me/invites/{invite_id}/decline');
  const change = useChange({
    reread: () =>
      queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', MINE).queryKey,
      }),
    rereadDone: false,
    behind: LAPSED,
    focus: card,
  });

  const decide = (invite: Invite, choice: 'accept' | 'decline', code?: string) =>
    change.run(choice, async () => {
      const params = { path: { invite_id: invite.id } };
      let decided: Invite;
      if (choice === 'accept') {
        const answer = await accept.mutateAsync({
          params,
          body: { code: code === undefined || code === '' ? null : code },
        });
        decided = answer.invite;
        if (answer.entered !== null) onEntered(answer.entered);
      } else {
        decided = await decline.mutateAsync({ params });
      }
      queryClient.setQueryData<Invite[]>(
        $api.queryOptions('get', MINE).queryKey,
        (invites) =>
          invites?.map((found) => (found.id === decided.id ? decided : found)),
      );
      queryClient.setQueriesData<Invite>({ queryKey: ['post', OPEN] }, (found) =>
        found?.id === decided.id ? decided : found,
      );
      if (decided.status !== 'accepted') return;
      const { org, contest } = decided.where;
      const stale =
        decided.grants === 'contestant' || decided.grants === 'member'
          ? [
              $api.queryOptions('get', '/api/v1/contests').queryKey,
              ...(contest === null
                ? []
                : [
                    $api.queryOptions(
                      'get',
                      '/api/v1/orgs/{org}/contests/{contest}/home',
                      {
                        params: { path: { org, contest } },
                      },
                    ).queryKey,
                  ]),
            ]
          : [$api.queryOptions('get', '/api/v1/me').queryKey];
      await Promise.all(
        stale.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    });

  return { pending: change.pending, error: change.error, decide };
}
