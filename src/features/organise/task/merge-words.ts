import type { MergeWords } from '../forms/MergeView';
import type { MergePath } from '../forms/merge';
import { isRecord, NumberText } from '../forms/yaml-doc';
import { percentOf } from '../contest/percent';
import { taskPlace } from './places';
import { SHOWS } from './scoring';

/**
 * The task's settings in words for the merge of two saves (M27): each
 * setting named as its card names it, and each value as the cards say it,
 * never as the settings file holds it.
 */

const RULE_WEIGHTS: Record<string, string> = {
  each: 'Points by the share of tests passed',
  worst: 'Points by the worst test',
  pass: 'Points when enough tests pass',
  pass_at: 'Share of tests that must pass',
  test_weights: 'Test weights',
};

const INPUT_DETAILS: Record<string, string> = {
  label: 'Label shown to entrants',
  options: 'Choices entrants have',
  default: 'To start with',
  min: 'Smallest allowed',
  max: 'Largest allowed',
  max_size: 'Maximum size',
};

/** A setting of the task named in words: "Tests and scoring, small: When entrants see results". */
function fieldName(path: MergePath, titles: ReadonlyMap<string, string>): string {
  const keys = path.filter((step): step is string => typeof step === 'string');
  const [top, second, third] = keys;
  if (top === 'test_groups' && second !== undefined && third !== undefined) {
    const named = RULE_WEIGHTS[third];
    if (named !== undefined) return `Tests and scoring, ${second}: ${named}`;
  }
  if (top === 'inputs' && second !== undefined && third !== undefined) {
    return `Inputs: ${titles.get(second) ?? second}, ${(INPUT_DETAILS[third] ?? third).toLowerCase()}`;
  }
  return taskPlace(keys.join('.'), '', titles).label;
}

/** A value of a task setting in words, or null where it reads well as it is. */
function valueWords(path: MergePath, value: unknown): string | null {
  const key = [...path]
    .reverse()
    .find((step): step is string => typeof step === 'string');
  if (key === 'show' && typeof value === 'string') {
    return SHOWS.find((show) => show.value === value)?.label ?? null;
  }
  if (key === 'pass_at' && value instanceof NumberText)
    return `${percentOf(value.text)}%`;
  if (key === 'credit') {
    if (typeof value === 'string') return `A score the workflow gives it: ${value}`;
    if (isRecord(value) && typeof value['relative'] === 'string') {
      return `Its ${value['relative']} against the best anyone reached`;
    }
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (isRecord(value) && typeof value['secret'] === 'string') {
    return `The org’s secret ${value['secret']}`;
  }
  return null;
}

/** The words the merge of two saves of the task's settings uses. */
export function taskMergeWords(titles: ReadonlyMap<string, string>): MergeWords {
  return { field: (path) => fieldName(path, titles), value: valueWords };
}
