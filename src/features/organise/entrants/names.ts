import { $api } from '@/api/query';
import type { OrganisedEntrant } from '@/api/types';

export const ENTRANTS = '/api/v1/orgs/{org}/contests/{contest}/organise/entrants';

/** Read again now and then, since nothing pushes a change of entrant. */
export function useEntrants(
  org: string,
  contest: string,
  { enabled = true, every }: { enabled?: boolean; every?: number } = {},
) {
  return $api.useQuery(
    'get',
    ENTRANTS,
    { params: { path: { org, contest } } },
    { enabled, refetchInterval: every },
  );
}

/** The asker key questions and board rows use: `entrant.` and the id's 32 hex digits. */
function askerOf(entrant: Pick<OrganisedEntrant, 'id'>): string {
  return `entrant.${entrant.id.replaceAll('-', '')}`;
}

/** "An entrant" until the list is read, or when the asker is not in it. */
export function useEntrantName(org: string, contest: string | null, asker: string) {
  const entrants = useEntrants(org, contest ?? '', { enabled: contest !== null }).data;
  return (
    entrants?.find((entrant) => askerOf(entrant) === asker)?.display_name ??
    'An entrant'
  );
}

export function entrantsLine(entrants: OrganisedEntrant[]): string {
  if (entrants.length === 0) return 'Nobody has registered yet.';
  const waiting = entrants.filter((one) => one.status === 'pending').length;
  const all = `${String(entrants.length)} ${entrants.length === 1 ? 'entrant' : 'entrants'}`;
  return waiting === 0 ? `${all}.` : `${all}, ${String(waiting)} waiting for approval.`;
}
