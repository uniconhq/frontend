import { $api } from '@/api/query';
import { EDITED } from '@/live';

/** The draft read once for editing; a save writes its answer back here. */
export function draftQuery(owner: string, name: string) {
  return $api.queryOptions(
    'get',
    '/api/v1/workflows/{owner}/{name}/draft',
    { params: { path: { owner, name } } },
    { meta: EDITED, staleTime: Infinity, refetchOnWindowFocus: false },
  );
}
