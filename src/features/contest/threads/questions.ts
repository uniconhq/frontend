import { $api } from '@/api/query';
import { useFallbackPoll } from '@/live';

export const QUESTIONS = '/api/v1/orgs/{org}/contests/{contest}/questions';

/** The `?task=` a task's link to the questions page sets. */
export const ASK_ABOUT = 'task';

export function useMyQuestions(org: string, contest: string) {
  return $api.useQuery(
    'get',
    QUESTIONS,
    { params: { path: { org, contest } } },
    { refetchInterval: useFallbackPoll(30_000) },
  );
}
