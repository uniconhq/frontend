import { contestPath } from '@/lib/organiser-paths';
import { contestSectionPath } from '@/lib/sections';
import { letterOf } from '../forms/contest-values';

/**
 * Where on the contest's pages each of its settings is changed, so a save
 * refused for a setting names it in words and opens it, and the merge of two
 * saves names each setting the same way. A refusal names a setting by its
 * place in the settings file (`tasks[1].due`); that place is turned here
 * into the page, the part of the page and the field, and the words for
 * them: "Tasks, B: Due".
 */

/** The part of the contest's pages a setting is changed on. */
type ContestPart = 'status' | 'settings' | 'entry' | 'tasks' | 'boards';

export type ContestPlace = {
  part: ContestPart;
  /** The setting in words, with where it is: "Settings, Schedule: Start". */
  label: string;
  /**
   * The field on its page, as the page marks it (`data-field`), to be
   * opened and focused, or none for the part as a whole.
   */
  field: string | null;
  /** Which task, board or way the field belongs to, by its place in its list. */
  item: number | null;
};

/** A setting's place as the forge writes it, split: `tasks[1].due` is `tasks`, 1, `due`. */
export function stepsOf(path: string): (string | number)[] {
  const steps: (string | number)[] = [];
  for (const part of path.split('.')) {
    if (part === '') continue;
    const found = /^([^[]*)((?:\[\d+\])*)$/.exec(part);
    if (found === null) {
      steps.push(part);
      continue;
    }
    const [, key = '', indices = ''] = found;
    if (key !== '') steps.push(key);
    for (const index of indices.matchAll(/\[(\d+)\]/g)) steps.push(Number(index[1]));
  }
  return steps;
}

const SETTINGS: Record<string, [string, string]> = {
  name: ['Basics', 'Name'],
  description: ['Basics', 'Description'],
  start: ['Schedule', 'Start'],
  end: ['Schedule', 'End'],
  on_system_error: ['When grading fails', 'A submission whose grading failed'],
};

const TEAMS: Record<string, string> = {
  most: 'Most people in a team',
  fewest: 'Fewest people in a team',
  locks: 'When teams are fixed',
};

const STATUS: Record<string, string> = {
  state: 'Open, draft or archived',
  visibility: 'Who sees it',
};

const REGISTRATION: Record<string, string> = {
  opens: 'Registration opens',
  closes: 'Registration closes',
  capacity: 'Most entrants',
  ways: 'Ways in',
};

const WAY: Record<string, string> = {
  approval: 'Approval',
  name: 'Name',
  code: 'Code',
  domains: 'Email domains',
  email_pattern: 'Email pattern',
};

export const TASK_FIELDS: Record<string, string> = {
  id: 'Task',
  worth: 'Worth',
  release_at: 'Opens',
  due: 'Due',
  late_per_day: 'Taken off per late day',
  closes: 'Closes',
  marks: 'Marks',
};

export const BOARD_FIELDS: Record<string, string> = {
  name: 'Name',
  tasks: 'Tasks',
  over: 'Results counted',
  select: 'Which submission counts',
  order: 'Ranked by',
  who: 'Shown to',
  rows: 'Rows shown',
};

/**
 * Where a setting of the contest, by its place in the settings file, is
 * changed. The file as a whole, or a setting no page has, is the settings
 * page as a whole.
 */
export function contestPlace(path: string): ContestPlace {
  const steps = stepsOf(path);
  const [top, second, third, fourth] = steps;
  const whole: ContestPlace = {
    part: 'settings',
    label: 'Settings',
    field: null,
    item: null,
  };
  if (typeof top !== 'string') return whole;

  const settings = SETTINGS[top];
  if (settings !== undefined) {
    const [group, label] = settings;
    return {
      part: 'settings',
      label: `Settings, ${group}: ${label}`,
      field: top,
      item: null,
    };
  }
  const status = STATUS[top];
  if (status !== undefined) {
    return { part: 'status', label: `Status: ${status}`, field: top, item: null };
  }
  if (top === 'entrants') {
    const label = typeof second === 'string' ? TEAMS[second] : undefined;
    return {
      part: 'settings',
      label: label === undefined ? 'Settings, Teams' : `Settings, Teams: ${label}`,
      field: label === undefined ? 'most' : (second as string),
      item: null,
    };
  }
  if (top === 'registration') {
    if (second === 'ways' && typeof third === 'number') {
      // A way is `{invite: {...}}` or `{signup: {...}}`: its field is under its kind.
      const field =
        typeof fourth === 'string' && typeof steps[4] === 'string' ? steps[4] : null;
      const named = field === null ? undefined : WAY[field];
      const way = `How people enter, way ${String(third + 1)}`;
      return {
        part: 'entry',
        label: named === undefined ? way : `${way}: ${named}`,
        field: named === undefined ? 'way' : field,
        item: third,
      };
    }
    const label = typeof second === 'string' ? REGISTRATION[second] : undefined;
    return {
      part: 'entry',
      label: label === undefined ? 'How people enter' : `How people enter: ${label}`,
      field: label === undefined ? null : (second as string),
      item: null,
    };
  }
  if (top === 'tasks') {
    if (typeof second !== 'number') {
      return { part: 'tasks', label: 'Tasks', field: null, item: null };
    }
    const label = typeof third === 'string' ? TASK_FIELDS[third] : undefined;
    const task = `Tasks, ${letterOf(second)}`;
    return {
      part: 'tasks',
      label: label === undefined ? task : `${task}: ${label}`,
      field: label === undefined ? null : (third as string),
      item: second,
    };
  }
  if (top === 'leaderboards') {
    if (typeof second !== 'number') {
      return { part: 'boards', label: 'Leaderboards', field: null, item: null };
    }
    const label = typeof third === 'string' ? BOARD_FIELDS[third] : undefined;
    const board = `Leaderboards, leaderboard ${String(second + 1)}`;
    return {
      part: 'boards',
      label: label === undefined ? board : `${board}: ${label}`,
      field: label === undefined ? null : (third as string),
      item: second,
    };
  }
  return whole;
}

/** The parameters of a contest page's address that open a part and focus a field. */
export const FIELD_PARAM = 'field';
export const ITEM_PARAM = 'item';

/** The address that opens a place: its page, with the field and its item to open. */
export function placeHref(org: string, contest: string, place: ContestPlace): string {
  const base =
    place.part === 'status' || place.part === 'tasks'
      ? contestPath(org, contest)
      : contestSectionPath(org, contest, place.part);
  const search = new URLSearchParams();
  if (place.part === 'tasks') search.set('part', 'tasks');
  if (place.field !== null) search.set(FIELD_PARAM, place.field);
  if (place.item !== null) search.set(ITEM_PARAM, String(place.item));
  const query = search.toString();
  return query === '' ? base : `${base}?${query}`;
}

/** The contest's settings as they are stored, read-only, in its files. */
export function viewFilePath(org: string, contest: string): string {
  return `${contestSectionPath(org, contest, 'files')}?file=contest.yaml`;
}
