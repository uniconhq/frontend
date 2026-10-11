import { $api } from '@/api/query';
import { useFallbackPoll } from '@/live';

export const QUESTIONS = '/api/v1/orgs/{org}/contests/{contest}/questions';

/** The address's `?task=` on the questions page, the task a link from its page asks about. */
export const ASK_ABOUT = 'task';

/**
 * The reader's questions to the organisers of a contest, read again when a
 * nudge says one changed and polled while the live stream is closed. The
 * questions page and the contest's page share the one read.
 */
export function useMyQuestions(org: string, contest: string) {
  return $api.useQuery(
    'get',
    QUESTIONS,
    { params: { path: { org, contest } } },
    { refetchInterval: useFallbackPoll(30_000) },
  );
}
