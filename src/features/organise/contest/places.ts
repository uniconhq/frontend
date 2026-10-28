import { contestPath } from '@/lib/organiser-paths';
import { contestSectionPath } from '@/lib/sections';
import { letterOf } from '../forms/contest-values';
import { exactJS, isRecord, parseYaml, textOf } from '../forms/yaml-doc';

/**
 * Where on the contest's pages each of its settings is changed, so a save
 * refused for a setting names it in words and opens it, and the merge of two
 * saves names each setting the same way. A refusal names a setting by its
 * place in the settings file (`tasks[1].due`); that place is turned here
 * into the page, the part of the page and the field, and the words for
 * them: "Tasks, B: Due". Each is said in the words its page shows, and a
 * leaderboard by the name its card is headed with.
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
};

const TEAMS: Record<string, string> = {
  most: 'Most people in a team',
  fewest: 'Fewest people in a team',
  locks: 'Teams are fixed',
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
  name: 'Name of this sign-up',
  code: 'Code',
  domains: 'Email domains',
  email_pattern: 'Email pattern',
};

export const TASK_FIELDS: Record<string, string> = {
  id: 'Task',
  release_at: 'Opens',
  due: 'Due',
  closes: 'Closes',
  marks: 'Submissions each entrant may mark',
};

/** Each leaderboard's name by its key, as the settings in `text` give it. */
export type BoardNames = Readonly<Record<string, string>>;

/**
 * The name each leaderboard of the settings is given, by its key: the name
 * its card is headed with. One with no name, or settings that cannot be
 * read, are left out, to be named by their key.
 */
export function boardNames(text: string): BoardNames {
  const parsed = parseYaml(text);
  if ('error' in parsed) return {};
  const root = exactJS(parsed.doc);
  const boards = isRecord(root) ? root['leaderboards'] : undefined;
  if (!isRecord(boards)) return {};
  const names: Record<string, string> = {};
  for (const [key, board] of Object.entries(boards)) {
    const title = isRecord(board) ? textOf(board['title']).trim() : '';
    if (title !== '') names[key] = title;
  }
  return names;
}

/**
 * Where a setting of the contest, by its place in the settings file, is
 * changed. The file as a whole, or a setting no page has, is the settings
 * page as a whole. `names` gives the leaderboards' names, by key.
 */
export function contestPlace(path: string, names: BoardNames = {}): ContestPlace {
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
  if (top === 'hold') {
    const named =
      second === 'from' ? 'Freeze from' : second === 'until' ? 'Until' : undefined;
    return {
      part: 'boards',
      label:
        named === undefined ? 'Leaderboards, Freeze' : `Leaderboards, Freeze: ${named}`,
      field: typeof second === 'string' ? `hold.${second}` : 'hold.from',
      item: null,
    };
  }
  if (top === 'leaderboards') {
    if (typeof second !== 'string') {
      return { part: 'boards', label: 'Leaderboards', field: null, item: null };
    }
    return leaderboardPlace(second, names[second] ?? second, third, fourth);
  }
  return whole;
}

/** A leaderboard's parts, as its card heads them or labels their fields. */
export const BOARD_PARTS: Record<string, string> = {
  title: 'Name',
  columns: 'Columns',
  sort: 'Ranking',
  display: 'Shown on the leaderboard',
  audience: 'Who can see this leaderboard?',
};

/** Who sees a leaderboard and how much of it, as its two questions ask. */
const AUDIENCE: Record<string, string> = {
  who: 'Who can see this leaderboard?',
  rows: 'How many rows do they see?',
};

/**
 * A leaderboard stored as a mapping, found by its key and named by `name`.
 * `item` stays empty: the key is in the field.
 */
function leaderboardPlace(
  key: string,
  name: string,
  third: string | number | undefined,
  fourth: string | number | undefined,
): ContestPlace {
  const board = `Leaderboards, ${name}`;
  if (third === 'columns' && typeof fourth === 'string') {
    return {
      part: 'boards',
      label: `${board}: ${fourth}`,
      field: `${key}.columns.${fourth}`,
      item: null,
    };
  }
  if (third === 'audience' && typeof fourth === 'string') {
    const named = AUDIENCE[fourth] ?? BOARD_PARTS['audience'];
    return {
      part: 'boards',
      label: `${board}: ${named}`,
      field: `${key}.audience.${fourth}`,
      item: null,
    };
  }
  if (typeof third === 'string') {
    const named = BOARD_PARTS[third];
    return {
      part: 'boards',
      label: named === undefined ? board : `${board}: ${named}`,
      field: `${key}.${third}`,
      item: null,
    };
  }
  return { part: 'boards', label: board, field: `${key}.key`, item: null };
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

/** The anchor of a Settings page's part that holds the settings as stored. */
export const STORED = 'file';

/**
 * The contest's settings as they are stored, to read, with every change to
 * them: the last part of its Settings page.
 */
export function viewFilePath(org: string, contest: string): string {
  return `${contestSectionPath(org, contest, 'settings')}#${STORED}`;
}
