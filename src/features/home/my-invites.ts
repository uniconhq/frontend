import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import { isApiError } from '@/api/problem';
import type { Invite } from '@/api/types';

const MINE = '/api/v1/me/invites';
const OPEN = '/api/v1/me/invites/open';

/** The caller's pending invites, lapsed ones flagged. */
export function useMyInvites() {
  return $api.useQuery('get', MINE);
}

/**
 * Accept or decline, and leave the answer in place of the invite wherever the
 * page shows it, so the card says what came of it rather than vanishing. An
 * accepted role reads the session again, since the roles there decide what
 * every page offers; an accepted place reads the contest list again, since
 * an invite-only or hidden contest now shows in it. A refusal because the
 * invite lapsed reads the list again, which shows it lapsed; any other keeps
 * the card, so its reason stays beside it.
 */
export function useDecide() {
  const queryClient = useQueryClient();
  const accept = $api.useMutation('post', '/api/v1/me/invites/{invite_id}/accept');
  const decline = $api.useMutation('post', '/api/v1/me/invites/{invite_id}/decline');

  return async (invite: Invite, choice: 'accept' | 'decline'): Promise<void> => {
    const mutation = choice === 'accept' ? accept : decline;
    let decided: Invite;
    try {
      decided = await mutation.mutateAsync({
        params: { path: { invite_id: invite.id } },
      });
    } catch (refused) {
      if (isApiError(refused) && refused.code === 'invite_expired') {
        await queryClient.invalidateQueries({
          queryKey: $api.queryOptions('get', MINE).queryKey,
        });
      }
      throw refused;
    }
    queryClient.setQueryData<Invite[]>(
      $api.queryOptions('get', MINE).queryKey,
      (invites) => invites?.map((found) => (found.id === decided.id ? decided : found)),
    );
    queryClient.setQueriesData<Invite>({ queryKey: ['post', OPEN] }, (found) =>
      found?.id === decided.id ? decided : found,
    );
    if (decided.status !== 'accepted') return;
    const stale =
      decided.grants === 'contestant'
        ? $api.queryOptions('get', '/api/v1/contests').queryKey
        : $api.queryOptions('get', '/api/v1/me').queryKey;
    await queryClient.invalidateQueries({ queryKey: stale });
  };
}
