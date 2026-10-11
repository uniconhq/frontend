import { useQuery } from '@tanstack/react-query';
import { queryView, type QueryView } from '@/api/query';
import type { Invite } from '@/api/types';
import { useMe } from '@/session';
import { count } from '../hub/count';
import { invitesQuery } from '../invites/invites';
import { holdsAt, type RolePlace } from '../roles';
import { useHolders } from './holders';

/**
 * What an organisers card says: how many people organise here, and how many
 * invites to join them are still waiting for an answer, such as "3
 * organisers, 2 invites pending". Someone who does not observe the place is
 * not shown the list, and the card says whose it is.
 */
export function useOrganisersLine(place: RolePlace): QueryView<string> {
  const observes = holdsAt(useMe().roles, place, 'observer');
  const holders = queryView(useHolders(place, { enabled: observes }));
  const invites = queryView(
    useQuery<Invite[]>({ ...invitesQuery(place), enabled: observes }),
  );
  if (!observes) {
    return {
      state: 'ready',
      data: `Only the ${place.kind}'s organisers see this list.`,
    };
  }
  if (holders.state !== 'ready') return holders;
  const pending =
    invites.state === 'ready'
      ? invites.data.filter(
          (invite) =>
            invite.grants !== 'contestant' &&
            invite.status === 'pending' &&
            !invite.expired,
        ).length
      : 0;
  const people = count(holders.data.length, 'organiser', 'organisers');
  return {
    state: 'ready',
    data:
      pending === 0
        ? people
        : `${people}, ${count(pending, 'invite', 'invites')} pending`,
  };
}
