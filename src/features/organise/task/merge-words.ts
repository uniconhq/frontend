import type { MergeWords } from '../forms/MergeView';
import type { MergePath } from '../forms/merge';
import { isRecord } from '../forms/yaml-doc';
import { taskPlace } from './places';

/**
 * The task's settings in words for the merge of two saves (M27): each
 * setting named as its card names it, and each value as the cards say it,
 * never as the settings file holds it.
 */

const INPUT_DETAILS: Record<string, string> = {
  label: 'Label shown to entrants',
  options: 'Choices entrants have',
  default: 'To start with',
  min: 'Smallest allowed',
  max: 'Largest allowed',
  max_size: 'Maximum size',
};

/** A setting of the task named in words: "Inputs: Time limit, maximum size". */
function fieldName(path: MergePath, titles: ReadonlyMap<string, string>): string {
  const keys = path.filter((step): step is string => typeof step === 'string');
  const [top, second, third] = keys;
  if (top === 'inputs' && second !== undefined && third !== undefined) {
    return `Inputs: ${titles.get(second) ?? second}, ${(INPUT_DETAILS[third] ?? third).toLowerCase()}`;
  }
  return taskPlace(keys.join('.'), '', titles).label;
}

/** A value of a task setting in words, or null where it reads well as it is. */
function valueWords(_path: MergePath, value: unknown): string | null {
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
