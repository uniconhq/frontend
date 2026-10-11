import type { TaskStanding } from '@/api/types';
import { formatExact } from '@/lib/exact';
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
 * A task's timeline in its contest as one line: what it is worth, when it
 * opens, falls due and closes, what a late day costs, and, when a board
 * counts marked submissions, how many may be marked. "100 points · opens
 * with the contest · due 1 Mar 23:59 · loses 10% per started day late ·
 * closes 8 Mar". `contest` holds the contest's start and end, in the
 * organiser's time, so a time that is the contest's own reads as such.
 */
export function timelineSentence(
  { timeline, state }: TaskStanding,
  contest: { start: string; end: string } | null,
  marks: string | null,
): string {
  const worth =
    timeline.worth !== null
      ? `${formatExact(timeline.worth)} ${timeline.worth === '1' ? 'point' : 'points'}`
      : state.latest === null
        ? 'points known once published'
        : 'gives no points';
  const opens = same(timeline.release_at, contest?.start)
    ? 'opens with the contest'
    : `opens ${when(timeline.release_at)}`;
  const due =
    timeline.due === null
      ? []
      : [
          `due ${when(timeline.due)}`,
          timeline.late_per_day === null || timeline.late_per_day === '1'
            ? 'earns nothing once late'
            : `loses ${percentOf(timeline.late_per_day)}% per started day late`,
        ];
  const closes = same(timeline.closes, contest?.end)
    ? 'closes with the contest'
    : `closes ${when(timeline.closes)}`;
  const marked =
    marks === null
      ? []
      : [`up to ${marks} marked ${marks === '1' ? 'submission' : 'submissions'}`];
  return [worth, opens, ...due, closes, ...marked].join(' · ');
}

/** Whether a board that counts marked submissions covers the task. */
export function markedBoardCovers(values: ContestValues, task: string): boolean {
  return values.boards.some(
    (board) =>
      board.select === 'marked' && (board.tasks === null || board.tasks.includes(task)),
  );
}
