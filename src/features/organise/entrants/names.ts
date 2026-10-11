import { $api } from '@/api/query';
import type { OrganisedEntrant } from '@/api/types';

export const ENTRANTS = '/api/v1/orgs/{org}/contests/{contest}/organise/entrants';

/**
 * Every entrant of the contest as its organisers read them, read again now
 * and then, since nothing pushes a change of entrant.
 */
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

/**
 * How a question's asker and a board's row name an entrant, `entrant.` and
 * its id's 32 hex digits, for an entrant read from the list.
 */
function askerOf(entrant: Pick<OrganisedEntrant, 'id'>): string {
  return `entrant.${entrant.id.replaceAll('-', '')}`;
}

/**
 * The name an entrant goes by, from its asker key, once the contest's
 * entrants are read; "An entrant" until then, or when it is not among them.
 */
export function useEntrantName(org: string, contest: string | null, asker: string) {
  const entrants = useEntrants(org, contest ?? '', { enabled: contest !== null }).data;
  return (
    entrants?.find((entrant) => askerOf(entrant) === asker)?.display_name ??
    'An entrant'
  );
}

/** The entrants with a count line: how many, and how many wait for approval. */
export function entrantsLine(entrants: OrganisedEntrant[]): string {
  if (entrants.length === 0) return 'Nobody has registered yet.';
  const waiting = entrants.filter((one) => one.status === 'pending').length;
  const all = `${String(entrants.length)} ${entrants.length === 1 ? 'entrant' : 'entrants'}`;
  return waiting === 0 ? `${all}.` : `${all}, ${String(waiting)} waiting for approval.`;
}
