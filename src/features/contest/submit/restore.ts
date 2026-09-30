import { useQueryClient } from '@tanstack/react-query';
import { $api } from '@/api/query';
import type { SubmittedFiles } from '@/api/types';
import { emptyDraft, entryOf, type Draft, type Entry, type PanelInput } from './draft';

/** A file's name: the last segment of its path in the submission. */
function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Reads an earlier submission back as a draft: each file it was made with,
 * under its own name, a code input's language, and each value it gave. Only
 * the inputs the task takes now are filled; one the task no longer has is
 * left out and one it has since added starts empty. Nothing about the old
 * submission changes, and submitting the draft makes a new one.
 *
 * The reads go through the query client, so a session that ended on the way
 * is noticed as everywhere else; a file is not kept in the cache once read.
 */
export function useRestore(org: string, contest: string, task: string) {
  const queryClient = useQueryClient();

  const readFile = async (number: number, path: string): Promise<File> => {
    const blob = await queryClient.fetchQuery({
      ...$api.queryOptions(
        'get',
        '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/submissions/{number}/files/{path}',
        { params: { path: { org, contest, task, number, path } }, parseAs: 'blob' },
      ),
      staleTime: 0,
      gcTime: 0,
    });
    return new File([await blob.arrayBuffer()], nameOf(path));
  };

  const entryFor = async (
    number: number,
    given: SubmittedFiles['inputs'][string],
    empty: Entry,
  ): Promise<Entry> => {
    switch (empty.kind) {
      case 'files': {
        const files = await Promise.all(
          given.files.map((path) => readFile(number, path)),
        );
        return { kind: 'files', files, language: given.language ?? empty.language };
      }
      case 'flag':
        return typeof given.value === 'boolean'
          ? { kind: 'flag', checked: given.value }
          : empty;
      case 'text':
        return given.value === null || typeof given.value === 'boolean'
          ? empty
          : { kind: 'text', text: String(given.value) };
    }
  };

  return async (number: number, inputs: PanelInput[]): Promise<Draft> => {
    const found = await queryClient.fetchQuery(
      $api.queryOptions(
        'get',
        '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/submissions/{number}/files',
        { params: { path: { org, contest, task, number } } },
      ),
    );
    const empty = emptyDraft(inputs);
    const entries = await Promise.all(
      inputs.map(async (input): Promise<[string, Entry]> => {
        const start = entryOf(empty, input);
        const given = found.inputs[input.id];
        return [
          input.id,
          given === undefined ? start : await entryFor(number, given, start),
        ];
      }),
    );
    return Object.fromEntries(entries);
  };
}
