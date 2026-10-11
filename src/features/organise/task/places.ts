import { taskPath } from '@/lib/organiser-paths';
import { taskSectionPath } from '@/lib/sections';
import type { PlaceOf, ProblemPlace } from '../DefinitionErrors';
import { contestPlaceOf } from '../contest/opened';
import { FIELD_PARAM, ITEM_PARAM, stepsOf } from '../contest/places';
import type { Place } from '../files/place';

/**
 * Where on the task's pages each of its settings and files is changed, so a
 * save refused for one names it in words and opens it. A refusal names a
 * setting by its place in the task's settings file (`test_groups.small.show`)
 * or a file by its path (`tests/small/3/answer`); that place is turned here
 * into the card, the field and the item it belongs to, and the words for
 * them: "Tests and scoring, small: When entrants see results".
 */

/**
 * The cards of the task's page a setting is changed on, and its Settings
 * page, which holds its title. `tests` is the Tests and scoring card, which
 * also holds the submission rules.
 */
type TaskCard = 'workflow' | 'inputs' | 'tests' | 'statement' | 'settings';

export type TaskPlace = {
  card: TaskCard;
  /** The setting in words, with where it is: "Inputs: Time limit". */
  label: string;
  /** The field on its card, as the card marks it (`data-field`), or none for the card. */
  field: string | null;
  /** The input, test group or test group of a test the field belongs to (`data-item`). */
  item: string | null;
};

/** The card's own name, as the page heads it. */
const CARD_LABELS: Record<TaskCard, string> = {
  workflow: 'Workflow',
  inputs: 'Inputs',
  tests: 'Tests and scoring',
  statement: 'Statement',
  settings: 'Settings',
};

const GROUP_FIELDS: Record<string, [string, string]> = {
  each: ['rule', 'Points'],
  worst: ['rule', 'Points'],
  pass: ['rule', 'Points'],
  pass_at: ['rule', 'Share of tests that must pass'],
  show: ['show', 'When entrants see results'],
  test_weights: ['rule', 'Test weights'],
};

const SUBMISSION_FIELDS: Record<string, [string, string]> = {
  max: ['max', 'Most submissions'],
  rate: ['count', 'Submissions in a window'],
  count: ['count', 'Submissions in a window'],
  per: ['per', 'Length of the window'],
};

/** A test's place in the card: its row, by its name, in its group. */
export function testField(test: string): string {
  return `test:${test}`;
}

/** Where a file under `tests/` is changed: the Tests card, at its group or test. */
function testsPlace(path: string): TaskPlace {
  const [group, test] = path.slice('tests/'.length).split('/');
  if (group === undefined || group === '') {
    return { card: 'tests', label: 'Tests', field: null, item: null };
  }
  if (test === undefined || test === '') {
    return { card: 'tests', label: `Tests, ${group}`, field: null, item: group };
  }
  return {
    card: 'tests',
    label: `Tests, ${group}, test ${test}`,
    field: testField(test),
    item: group,
  };
}

/**
 * The card a problem of the whole file most likely concerns, by what its
 * sentence is about: the sentence is shown as it is beside it.
 */
function wholePlace(message: string): TaskPlace {
  const card: TaskCard = /\btest|group/i.test(message)
    ? 'tests'
    : /\bworkflow|\bstep/i.test(message)
      ? 'workflow'
      : /\binput/i.test(message)
        ? 'inputs'
        : 'settings';
  return { card, label: CARD_LABELS[card], field: null, item: null };
}

/**
 * Where a setting or file of the task, by the place a refusal names it at,
 * is changed. `titles` names each input as its workflow does ("Time limit"),
 * where it gives one; `message` is the problem's sentence, which says what
 * a problem of the whole file is about.
 */
export function taskPlace(
  path: string,
  message = '',
  titles: ReadonlyMap<string, string> = new Map(),
): TaskPlace {
  if (path === 'tests' || path.startsWith('tests/')) return testsPlace(path);
  if (path === 'statement.md' || path.startsWith('public/')) {
    return { card: 'statement', label: 'Statement', field: null, item: null };
  }
  if (path === '' || path === 'task.yaml') return wholePlace(message);
  const [top, second, third, fourth] = stepsOf(path);
  switch (top) {
    case 'name':
      return { card: 'settings', label: 'Settings: Title', field: 'name', item: null };
    case 'workflow':
    case 'steps':
    case 'report':
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
    case 'credit':
      return {
        card: 'tests',
        label: 'Tests and scoring: How a test earns',
        field: 'credit',
        item: null,
      };
    case 'test_groups': {
      if (typeof second !== 'string') {
        return {
          card: 'tests',
          label: 'Tests and scoring: Test groups',
          field: null,
          item: null,
        };
      }
      const group = `Tests and scoring, ${second}`;
      if (third === 'test_weights' && typeof fourth === 'string') {
        return {
          card: 'tests',
          label: `${group}, test ${fourth}: Test weight`,
          field: testField(fourth),
          item: second,
        };
      }
      const named = typeof third === 'string' ? GROUP_FIELDS[third] : undefined;
      return named === undefined
        ? { card: 'tests', label: group, field: 'rule', item: second }
        : {
            card: 'tests',
            label: `${group}: ${named[1]}`,
            field: named[0],
            item: second,
          };
    }
    case 'submissions': {
      const key =
        typeof fourth === 'string' ? fourth : third === undefined ? second : third;
      const named = typeof key === 'string' ? SUBMISSION_FIELDS[key] : undefined;
      return {
        card: 'tests',
        label:
          named === undefined
            ? 'Tests and scoring: Submission rules'
            : `Tests and scoring, Submission rules: ${named[1]}`,
        field: named?.[0] ?? 'max',
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
