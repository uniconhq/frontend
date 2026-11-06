import { parse } from 'yaml';
import type { DeclaredInput } from '@/api/types';

/** An input a task's workflow declares, required, with nothing more said of it. */
export function declared(
  id: string,
  type: string,
  more: Partial<DeclaredInput> = {},
): DeclaredInput {
  return {
    id,
    type,
    options: null,
    optional: false,
    title: null,
    help: null,
    unit: null,
    ...more,
  };
}

/**
 * A task's settings, written as `task.yaml`, as the server gives them to a
 * form: the file's data with `scoring.groups` as `[{name, picks}]` and
 * `scoring.values` as `[{name, formula}]`. Null when the text holds no
 * mapping of settings.
 */
export function taskValuesOf(text: string): Record<string, unknown> | null {
  const data: unknown = parse(text, { version: '1.2', schema: 'core' }) ?? {};
  if (!isMapping(data)) return null;
  const scoring = data['scoring'];
  if (isMapping(scoring)) {
    for (const [part, field] of PARTS) {
      const found = scoring[part];
      if (isMapping(found))
        scoring[part] = Object.entries(found).map(([name, item]) => ({
          name,
          [field]: item,
        }));
    }
  }
  return data;
}

/** The settings a form's values give, each named list a mapping again, as the file holds them. */
export function taskFileOf(values: unknown): Record<string, unknown> {
  const data = isMapping(values) ? structuredClone(values) : {};
  const scoring = data['scoring'];
  if (isMapping(scoring)) {
    for (const [part, field] of PARTS) {
      const found = scoring[part];
      if (Array.isArray(found))
        scoring[part] = Object.fromEntries(
          found.map((item: Record<string, unknown>) => [item['name'], item[field]]),
        );
    }
  }
  return data;
}

const PARTS = [
  ['groups', 'picks'],
  ['values', 'formula'],
] as const;

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
