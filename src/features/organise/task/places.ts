import { taskPath } from '@/lib/organiser-paths';
import { taskSectionPath } from '@/lib/sections';
import type { PlaceOf, ProblemPlace } from '../DefinitionErrors';
import { contestPlaceOf } from '../contest/opened';
import { FIELD_PARAM, ITEM_PARAM, stepsOf } from '../contest/places';
import type { Place } from '../files/place';

/**
 * Where on the task's pages each of its settings and files is changed, so a
 * save refused for one names it in words and opens it. A refusal names a
 * setting by its place in the task's settings file (`inputs.time_limit`) or
 * a file by its path (`checker/checker.py`); that place is turned here into
 * the card, the field and the item it belongs to, and the words for them:
 * "Inputs: Time limit".
 */

/**
 * The cards of the task's page a setting is changed on, and its Settings
 * page, which holds its title. `tests` is the Submissions card, which holds
 * the submission rules.
 */
type TaskCard =
  | 'workflow'
  | 'inputs'
  | 'runs'
  | 'scoring'
  | 'checks'
  | 'tests'
  | 'statement'
  | 'settings';

export type TaskPlace = {
  card: TaskCard;
  /** The setting in words, with where it is: "Inputs: Time limit". */
  label: string;
  /** The field on its card, as the card marks it (`data-field`), or none for the card. */
  field: string | null;
  /** The item the field belongs to (`data-item`), when it is one of several. */
  item: string | null;
};

/** The card's own name, as the page heads it. */
const CARD_LABELS: Record<TaskCard, string> = {
  workflow: 'Workflow',
  inputs: 'Inputs',
  runs: 'Runs',
  scoring: 'Scoring',
  checks: 'Checks',
  tests: 'Submissions',
  statement: 'Statement',
  settings: 'Settings',
};

const SUBMISSION_FIELDS: Record<string, [string, string]> = {
  max: ['max', 'Most submissions'],
  rate: ['count', 'Submissions in a window'],
  count: ['count', 'Submissions in a window'],
  per: ['per', 'Length of the window'],
};

/**
 * The card a problem of the whole file most likely concerns, by what its
 * sentence is about: the sentence is shown as it is beside it.
 */
function wholePlace(message: string): TaskPlace {
  const card: TaskCard = /\bworkflow|\bstep/i.test(message)
    ? 'workflow'
    : /\binput/i.test(message)
      ? 'inputs'
      : 'settings';
  return { card, label: CARD_LABELS[card], field: null, item: null };
}

/**
 * The input a file belongs to by its folder: a setting's own files go under
 * `<input>/` (M51), or `inputs/<input>/` for an input whose id is a folder
 * the format gives meaning to. Null for a path in no input's folder.
 */
function inputOfFile(path: string, titles: ReadonlyMap<string, string>): string | null {
  const parts = path.split('/');
  if (parts.length < 2) return null;
  const [first = '', second = ''] = parts;
  if (first === 'inputs' && parts.length >= 3 && titles.has(second)) return second;
  return titles.has(first) ? first : null;
}

/**
 * Where a setting or file of the task, by the place a refusal names it at,
 * is changed. `titles` names each input the workflow declares as it does
 * ("Time limit"), by its id where it gives no title; `message` is the problem's sentence, which says what
 * a problem of the whole file is about.
 */
export function taskPlace(
  path: string,
  message = '',
  titles: ReadonlyMap<string, string> = new Map(),
): TaskPlace {
  if (path === 'statement.md' || path.startsWith('public/')) {
    return { card: 'statement', label: 'Statement', field: null, item: null };
  }
  if (path === '' || path === 'task.yaml') return wholePlace(message);
  const input = inputOfFile(path, titles);
  if (input !== null) {
    return {
      card: 'inputs',
      label: `Inputs: ${titles.get(input) ?? input}`,
      field: input,
      item: null,
    };
  }
  const [top, second, third, fourth, fifth] = stepsOf(path);
  switch (top) {
    case 'name':
      return { card: 'settings', label: 'Settings: Title', field: 'name', item: null };
    case 'workflow':
    case 'steps':
      return { card: 'workflow', label: 'Workflow', field: 'workflow', item: null };
    case 'inputs': {
      if (typeof second !== 'string') {
        return { card: 'inputs', label: 'Inputs', field: null, item: null };
      }
      return {
        card: 'inputs',
        label: `Inputs: ${titles.get(second) ?? second}`,
        field: second,
        item: null,
      };
    }
    case 'submissions': {
      const key =
        typeof fourth === 'string' ? fourth : third === undefined ? second : third;
      const named = typeof key === 'string' ? SUBMISSION_FIELDS[key] : undefined;
      return {
        card: 'tests',
        label: named === undefined ? 'Submissions' : `Submissions: ${named[1]}`,
        field: named?.[0] ?? 'max',
        item: null,
      };
    }
    case 'scoring': {
      if (second === 'values' && typeof third === 'string') {
        return {
          card: 'scoring',
          label: `Scoring: ${third}`,
          field: `value-${third}`,
          item: null,
        };
      }
      if (second === 'groups' && typeof third === 'string') {
        return {
          card: 'scoring',
          label: `Scoring: ${third}`,
          field: `group-${third}`,
          item: null,
        };
      }
      return { card: 'scoring', label: 'Scoring', field: null, item: null };
    }
    case 'checks': {
      const index = typeof second === 'number' ? second : 0;
      return {
        card: 'checks',
        label: `Checks: check ${String(index + 1)}`,
        field: `check-${String(index)}`,
        item: null,
      };
    }
    case 'repeat': {
      const axis = typeof second === 'number' ? second : 0;
      const row = typeof fourth === 'number' ? fourth : 0;
      const name = typeof fifth === 'string' ? fifth : null;
      return {
        card: 'runs',
        label:
          name === null
            ? 'Runs'
            : `Runs, table ${String(axis + 1)}, row ${String(row + 1)}: ${name}`,
        field:
          name === null ? null : `axis-${String(axis)}-tuple-${String(row)}-${name}`,
        item: null,
      };
    }
    default:
      return wholePlace(message);
  }
}

/** The address a card's place is opened by: the card on the task's page, or Settings. */
function taskPlaceHref(
  org: string,
  contest: string,
  task: string,
  place: TaskPlace,
): string {
  const base =
    place.card === 'settings'
      ? taskSectionPath(org, contest, task, 'settings')
      : taskPath(org, contest, task);
  const search = new URLSearchParams();
  if (place.card !== 'settings') search.set(CARD_PARAM, place.card);
  if (place.field !== null) search.set(FIELD_PARAM, place.field);
  if (place.item !== null) search.set(ITEM_PARAM, place.item);
  const query = search.toString();
  return query === '' ? base : `${base}?${query}`;
}

/** The parameter of the task page's address that scrolls to one of its cards. */
export const CARD_PARAM = 'card';

/** Where each problem a refused save of the task lists is fixed, as a link. */
export function taskPlaceOf(
  org: string,
  contest: string,
  task: string,
  titles?: ReadonlyMap<string, string>,
) {
  return (path: string, message?: string): ProblemPlace => {
    const place = taskPlace(path, message, titles);
    return { label: place.label, to: taskPlaceHref(org, contest, task, place) };
  };
}

/** Where each problem a save at a place lists is fixed: a task's, or none known. */
export function placeOfIn(place: Place): PlaceOf | undefined {
  return place.kind === 'task'
    ? taskPlaceOf(place.org, place.contest, place.task)
    : contestPlaceOf(place.org, place.contest);
}
