import type { TaskStanding } from '@/api/types';
import { formatWorth } from '@/lib/exact';
import { formatDateTime } from '@/lib/time';
import type { ContestValues } from '../forms/contest-values';
import { percentOf } from './percent';

function when(at: string): string {
  return formatDateTime(new Date(at));
}

function same(at: string, local: string | undefined): boolean {
  return local !== undefined && local !== '' && Date.parse(at) === Date.parse(local);
}

/**
 * A task's timeline in its contest, in words: `worth`, what it is worth
 * ("100 points"), and `when`, when it is open, when it falls due and what
 * a late day costs, and, when a board counts marked submissions, how many an
 * entrant may mark ("open for the whole contest, due 1 Mar 23:59, then 10%
 * less per started day late"). `contest` holds the contest's start and end,
 * in the organiser's time, so a time that is the contest's own reads as
 * such.
 */
export function timelineWords(
  { timeline, state }: TaskStanding,
  contest: { start: string; end: string } | null,
  marks: string | null,
): { worth: string; when: string } {
  const worth =
    timeline.worth !== null
      ? `${formatWorth(timeline.worth)} ${timeline.worth === '1' ? 'point' : 'points'}`
      : state.latest === null
        ? 'points known once the task is published'
        : 'no points';
  const withStart = same(timeline.release_at, contest?.start);
  const withEnd = same(timeline.closes, contest?.end);
  const due =
    timeline.due === null
      ? null
      : `due ${when(timeline.due)}, ${
          timeline.late_per_day === null || timeline.late_per_day === '1'
            ? 'nothing once late'
            : `then ${percentOf(timeline.late_per_day)}% less per started day late`
        }`;
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
    worth,
    when: [...parts, marked].filter((part) => part !== null).join('; '),
  };
}

/** Whether a task closes when its contest ends. */
export function closesWithContest(
  { timeline }: TaskStanding,
  contest: { start: string; end: string } | null,
): boolean {
  return same(timeline.closes, contest?.end);
}

/** A task's timeline as one line: "100 points, open for the whole contest". */
export function timelineSentence(
  standing: TaskStanding,
  contest: { start: string; end: string } | null,
  marks: string | null,
): string {
  const { worth, when } = timelineWords(standing, contest, marks);
  return `${worth}, ${when}`;
}

/** Whether a board that counts marked submissions covers the task. */
export function markedBoardCovers(values: ContestValues, task: string): boolean {
  return values.boards.some(
    (board) =>
      board.select === 'marked' && (board.tasks === null || board.tasks.includes(task)),
  );
}
