import { useQueries } from '@tanstack/react-query';
import type { TaskStanding } from '@/api/types';
import { fileQuery } from '../files/place';
import type { ContestValues } from '../forms/contest-values';
import { readTask } from '../forms/task-values';
import { readSettings } from '../task/build-data';
import { markedBoardCovers, timelineSentence } from './timeline';

/** Where every task of a contest stands, with its place in the contest. */
export const STANDINGS = '/api/v1/orgs/{org}/contests/{contest}/organise/tasks';

/**
 * Each task's title, as its settings give it, by its name: read for every
 * task listed, as its own page reads it. A task whose settings are not read
 * yet, or give no title, is called by its name.
 */
export function useTaskTitles(
  org: string,
  contest: string,
  names: string[],
): ReadonlyMap<string, string> {
  const files = useQueries({
    queries: names.map((task) => ({
      ...fileQuery({ kind: 'task', org, contest, task }, 'task.yaml'),
      retry: false,
    })),
  });
  return new Map(
    names.map((task, at) => {
      const data = files[at]?.data;
      const read = data === undefined ? null : readSettings(data);
      const title =
        read === null || 'error' in read
          ? ''
          : readTask(read.doc, []).values.name.trim();
      return [task, title === '' ? task : title];
    }),
  );
}

/** A task as its row and its dialog call it: its letter and its title, "A · sum". */
export function labelOf(
  standing: TaskStanding,
  titles: ReadonlyMap<string, string>,
): string {
  return `${standing.label} · ${titles.get(standing.task.name) ?? standing.task.name}`;
}

/**
 * The task's place in its contest in one line, "open for the whole
 * contest", with how many submissions an entrant may mark when a
 * leaderboard reads marked ones.
 */
export function entrySentence(
  standing: TaskStanding,
  values: ContestValues | null,
): string {
  const entry = values?.tasks.find((found) => found.id === standing.task.name);
  const marks =
    values !== null && markedBoardCovers(values, standing.task.name)
      ? entry === undefined || entry.marks === ''
        ? '1'
        : entry.marks
      : null;
  return timelineSentence(standing, values, marks);
}
