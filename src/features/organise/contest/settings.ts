import { useQuery } from '@tanstack/react-query';
import { queryView, type QueryView } from '@/api/query';
import { fileQuery } from '../files/place';
import { readContest, type ContestValues } from '../forms/contest-values';
import { parseYaml, topMap } from '../forms/yaml-doc';

/**
 * The contest's settings as its file holds them, read for what its page and
 * its cards say of them, not for editing: the form reads the file afresh. It
 * is read again each time the page opens, since the settings page may have
 * just saved it. Null when the file is not settings the form can read.
 */
export function useContestSettings(
  org: string,
  contest: string,
): QueryView<ContestValues | null> {
  const view = queryView(
    useQuery({
      ...fileQuery({ kind: 'contest', org, contest }, 'contest.yaml'),
      staleTime: 0,
    }),
  );
  if (view.state !== 'ready') return view;
  const parsed = parseYaml(view.data.content);
  if ('error' in parsed) return { state: 'ready', data: null };
  if (topMap(parsed.doc) === 'not-a-mapping') return { state: 'ready', data: null };
  return { state: 'ready', data: readContest(parsed.doc).values };
}
