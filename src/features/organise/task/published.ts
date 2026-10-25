import type { FileChange, Publication } from '@/api/types';
import { formatDateTime } from '@/lib/time';

/** Who saved the change a publication is, by the task's history, when it says. */
export function savedBy(
  publication: Publication,
  history: readonly FileChange[] | undefined,
): string | null {
  return (
    history?.find((change) => change.version === publication.version)?.author ?? null
  );
}

/**
 * What entrants are graded on, in one line: the latest publication, when it
 * was saved and by whom, or that nothing is live yet (M21).
 */
export function publishedLine(
  latest: Publication | null,
  author: string | null = null,
): string {
  if (latest === null) return 'Not published yet, so entrants cannot be graded on it.';
  const by = author === null ? '' : ` by ${author}`;
  const saved = `Entrants are graded on publication ${String(latest.number)}, saved ${formatDateTime(new Date(latest.at))}${by}.`;
  if (latest.check === 'checking') return `${saved} Its checks are still running.`;
  if (latest.check === 'unchecked')
    return `Publication ${String(latest.number)} was never checked. The next save checks it.`;
  if (latest.check === 'refused')
    return `Publication ${String(latest.number)} was refused. Entrants stay on the last one that passed.`;
  return saved;
}
