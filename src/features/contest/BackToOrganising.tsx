import { $api } from '@/api/query';
import { contestPath } from '@/lib/organiser-paths';
import { PageLink } from '@/ui/PageLink';

/**
 * For an organiser on the entrants' view of their own contest, the way back
 * to organising it (M6), on every page of that view a signed-in person reads.
 * Whether they organise it comes from the contest's home, as its page reads it.
 */
export function BackToOrganising({ org, contest }: { org: string; contest: string }) {
  const home = $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/home', {
    params: { path: { org, contest } },
  });
  return home.data?.organises === true ? (
    <PageLink to={contestPath(org, contest)}>Back to organising</PageLink>
  ) : null;
}
