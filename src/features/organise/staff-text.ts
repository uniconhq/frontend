import { apiClient } from '@/api/client';
import type { TextAsk } from '@/ui/scored/ScoredResult';

type Where = { org: string; contest: string; task: string; number: number };

/** A text of a submission, as organisers read it, by the output that stored it. */
export function staffText(where: Where, entrant: string, ask: TextAsk): Promise<string> {
  if (ask.output == null || ask.name == null) return Promise.resolve('');
  return apiClient
    .GET(
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/organise/submissions/{number}/texts/{output}/{name}',
      {
        params: {
          path: { ...where, output: ask.output, name: ask.name },
          query: { entrant },
        },
        parseAs: 'text',
      },
    )
    .then((found) => found.data ?? '');
}
