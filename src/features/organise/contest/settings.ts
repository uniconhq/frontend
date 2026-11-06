import { useQuery } from '@tanstack/react-query';
import { queryView, type QueryView } from '@/api/query';
import { settingsQuery } from '../files/place';
import { readContest, type ContestValues } from '../forms/contest-values';

/**
 * The contest's settings, read for what its page and its cards say of them,
 * not for editing: the form reads them afresh. They are read again each time
 * the page opens, since the settings page may have just saved them. Null
 * when they do not read as settings.
 */
export function useContestSettings(
  org: string,
  contest: string,
): QueryView<ContestValues | null> {
  const view = queryView(
    useQuery({
      ...settingsQuery({ kind: 'contest', org, contest }),
      staleTime: 0,
    }),
  );
  if (view.state !== 'ready') return view;
  const values = view.data.values;
  return { state: 'ready', data: values === null ? null : readContest(values).values };
}
