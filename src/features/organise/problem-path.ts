import type { DefinitionError } from '@/api/types';

/**
 * Where a problem is in its file, as the server gives it: keys and list
 * indices (`["tasks", 1, "due"]`), one file path for a file, empty for the
 * file as a whole.
 */
export type ProblemPath = DefinitionError['path'];

/** Whether `path` is at `top` or inside it. */
export function isUnder(path: ProblemPath, top: readonly (string | number)[]): boolean {
  return path.length >= top.length && top.every((part, index) => path[index] === part);
}
