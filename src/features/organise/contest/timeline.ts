import type { TaskStanding } from '@/api/types';
import { formatDateTime } from '@/lib/time';
import type { ContestValues } from '../forms/contest-values';

function when(at: string): string {
  return formatDateTime(new Date(at));
}

function same(at: string, local: string | undefined): boolean {
  return local !== undefined && local !== '' && Date.parse(at) === Date.parse(local);
}

/** A time equal to the contest's own, in the organiser's zone, reads as opening or closing with it. */
function timelineWords(
  { timeline }: TaskStanding,
  contest: { start: string; end: string } | null,
  marks: string | null,
): { when: string } {
  const withStart = same(timeline.release_at, contest?.start);
  const withEnd = same(timeline.closes, contest?.end);
  const due = timeline.due === null ? null : `due ${when(timeline.due)}`;
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

export function timelineSentence(
  standing: TaskStanding,
  contest: { start: string; end: string } | null,
  marks: string | null,
): string {
  return timelineWords(standing, contest, marks).when;
}

/** Whether a leaderboard reads which of the task's submissions an entrant marks. */
export function markedBoardCovers(values: ContestValues, task: string): boolean {
  return values.marked.includes(task);
}
