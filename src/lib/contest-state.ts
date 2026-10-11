import { formatDateTime } from './time';

/**
 * Where a contest stands, in one word, as its organisers see it: a draft only
 * they see; live, opened to contestants, whether it has started or not;
 * finished once a live contest's end has passed; or archived.
 */
export type ContestStanding = 'draft' | 'live' | 'finished' | 'archived';

export const STANDING_WORD: Record<ContestStanding, string> = {
  draft: 'Draft',
  live: 'Live',
  finished: 'Finished',
  archived: 'Archived',
};

type Dated = { state: 'draft' | 'published' | 'archived'; start: string; end: string };

export function standingOf(contest: Dated, now: Date): ContestStanding {
  if (contest.state === 'draft') return 'draft';
  if (contest.state === 'archived') return 'archived';
  return now.getTime() >= Date.parse(contest.end) ? 'finished' : 'live';
}

function when(at: string): string {
  return formatDateTime(new Date(at));
}

/** One line of a contest's dates, as they matter where it stands. */
export function datesLine(contest: Dated, now: Date): string {
  const standing = standingOf(contest, now);
  if (standing === 'live') {
    return now.getTime() < Date.parse(contest.start)
      ? `Starts ${when(contest.start)}`
      : `Running until ${when(contest.end)}`;
  }
  if (standing === 'finished' || standing === 'archived') {
    return `Ended ${when(contest.end)}`;
  }
  return `${when(contest.start)} to ${when(contest.end)}`;
}

/**
 * The order an organiser wants their contests in: those running now first,
 * ending soonest first; then those still to start, soonest first; then
 * drafts; then finished and archived ones, the latest to end first. A contest
 * whose dates are not known yet goes last, by name.
 */
export function byWhatMattersNow<T extends { name: string; contest: Dated | null }>(
  contests: T[],
  now: Date,
): T[] {
  const at = now.getTime();
  const rank = (contest: Dated | null): [number, number] => {
    if (contest === null) return [5, 0];
    const start = Date.parse(contest.start);
    const end = Date.parse(contest.end);
    switch (standingOf(contest, now)) {
      case 'live':
        return start <= at ? [0, end] : [1, start];
      case 'draft':
        return [2, start];
      case 'finished':
        return [3, -end];
      case 'archived':
        return [4, -end];
    }
  };
  return [...contests].sort((a, b) => {
    const [groupA, keyA] = rank(a.contest);
    const [groupB, keyB] = rank(b.contest);
    return groupA - groupB || keyA - keyB || a.name.localeCompare(b.name);
  });
}
