import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/problem';
import type { FileContent, WriteFile } from '@/api/types';
import type { Outcome } from '../files/SaveOutcome';
import { fileQuery, staleAfterWrite } from '../files/place';
import { useFileWrite } from '../forms/file-hooks';
import { parseYaml, writeOver, type Doc } from '../forms/yaml-doc';

/**
 * One change to the contest's settings made by a button, such as opening
 * the contest: the settings read afresh, the change applied to them, and the
 * result saved with the version just read. A save someone else's beat in the
 * meantime is made again once on the settings as they are then, since a
 * change of one setting means the same on either. What the settings move is
 * read again after, whatever the answer.
 */
export function useContestChange(org: string, contest: string) {
  const place = { kind: 'contest' as const, org, contest };
  const queryClient = useQueryClient();
  const { write, pending } = useFileWrite(place, 'contest.yaml');

  const once = async (change: (doc: Doc) => void): Promise<Outcome> => {
    const file = await queryClient.fetchQuery<FileContent>({
      ...(fileQuery(place, 'contest.yaml') as {
        queryKey: readonly unknown[];
        queryFn: () => Promise<FileContent>;
      }),
      staleTime: 0,
    });
    const parsed = parseYaml(file.content);
    const body: WriteFile = {
      content: file.content,
      encoding: 'utf-8',
      token: file.token,
      confirm: false,
      keep_as_draft: false,
    };
    if ('error' in parsed) {
      return {
        kind: 'refused',
        body,
        error: new ApiError({
          code: 'unreadable_settings',
          status: 0,
          title: 'The contest’s settings cannot be read',
          detail: parsed.error,
        }),
      };
    }
    change(parsed.doc);
    return write({ ...body, content: writeOver(file.content, parsed.doc) });
  };

  const apply = async (change: (doc: Doc) => void): Promise<Outcome> => {
    let outcome = await once(change);
    if (outcome.kind === 'refused' && outcome.error.code === 'conflict') {
      outcome = await once(change);
    }
    await Promise.all(
      staleAfterWrite(place).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
    return outcome;
  };

  return { apply, pending };
}
