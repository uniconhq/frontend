import { $api } from '@/api/query';
import { contestPath } from '@/lib/organiser-paths';
import { PageLink } from '@/ui/PageLink';

/** An organiser's way back from the entrants' view of their contest (M6). */
export function BackToOrganising({ org, contest }: { org: string; contest: string }) {
  const home = $api.useQuery('get', '/api/v1/orgs/{org}/contests/{contest}/home', {
    params: { path: { org, contest } },
  });
  return home.data?.organises === true ? (
    <PageLink to={contestPath(org, contest)}>Back to organising</PageLink>
  ) : null;
}
