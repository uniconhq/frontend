import type { Publication } from '@/api/types';
import { formatDateTime } from '@/lib/time';

/** What contestants are graded on: the latest publication, or that there is none. */
export function publishedLine(latest: Publication | null): string {
  return latest === null
    ? 'Nothing is published yet, so contestants cannot see the task.'
    : `Contestants are graded on publication ${String(latest.number)}, of ${formatDateTime(new Date(latest.at))}.`;
}
