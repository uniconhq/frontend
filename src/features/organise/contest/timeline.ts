import type { TaskStanding } from '@/api/types';
import { formatDateTime } from '@/lib/time';
import type { ContestValues } from '../forms/contest-values';

function when(at: string): string {
  return formatDateTime(new Date(at));
}

function same(at: string, local: string | undefined): boolean {
  return local !== undefined && local !== '' && Date.parse(at) === Date.parse(local);
}

/**
 * A task's timeline in its contest, in words: when it is open and when it
 * falls due, and, when a leaderboard counts marked submissions, how many an
 * entrant may mark ("open for the whole contest, due 1 Mar 23:59"). `contest`
 * holds the contest's start and end, in the organiser's time, so a time that
 * is the contest's own reads as such.
 */
function timelineWords(
  { timeline }: TaskStanding,
  contest: { start: string; end: string } | null,
  marks: string | null,
): { when: string } {
  const withStart = same(timeline.release_at, contest?.start);
  const withEnd = same(timeline.closes, contest?.end);
  const due = timeline.due === null ? null : `due ${when(timeline.due)}`;
  // In the order they come: open, due, closed.
  const parts =
    withStart && withEnd
      ? ['open for the whole contest', due]
      : [
          withStart ? 'opens with the contest' : `opens ${when(timeline.release_at)}`,
          due,
          withEnd ? 'closes with the contest' : `closes ${when(timeline.closes)}`,
        ];
  const marked =
    marks === null
      ? null
      : `an entrant may mark up to ${marks} ${marks === '1' ? 'submission' : 'submissions'}`;
  return {
    when: [...parts, marked].filter((part) => part !== null).join('; '),
  };
}

/** A task's timeline as one line: "open for the whole contest". */
export function timelineSentence(
  standing: TaskStanding,
  contest: { start: string; end: string } | null,
  marks: string | null,
): string {
  return timelineWords(standing, contest, marks).when;
}

/** Whether a leaderboard that counts marked submissions covers the task. */
export function markedBoardCovers(values: ContestValues, task: string): boolean {
  return values.boards.some(
    (board) =>
      board.select === 'marked' && (board.tasks === null || board.tasks.includes(task)),
  );
}
