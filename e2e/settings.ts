import { parse } from 'yaml';
import type { components } from '../src/api/schema';

type Values = Record<string, unknown>;

function isMapping(value: unknown): value is Values {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A contest's settings, written as `contest.yaml`, as the server gives them to
 * a form: the file's data with `leaderboards` as `[{key, ...}]` and each
 * board's `columns` as `[{name, formula}]`.
 */
export function contestValuesOf(text: string): Values {
  const data = parse(text, { version: '1.2', schema: 'core' }) as Values;
  const boards = data['leaderboards'];
  if (isMapping(boards))
    data['leaderboards'] = Object.entries(boards).map(([key, board]) => {
      const entry: Values = { key, ...(board as Values) };
      const columns = entry['columns'];
      if (isMapping(columns))
        entry['columns'] = Object.entries(columns).map(([name, formula]) => ({
          name,
          formula,
        }));
      return entry;
    });
  return data;
}

/** A contest form's values as the file holds them, each named list a mapping again. */
export function contestFileOf(values: Values): Values {
  const data = structuredClone(values);
  const boards = data['leaderboards'];
  if (Array.isArray(boards))
    data['leaderboards'] = Object.fromEntries(
      boards.map((board: Values) => {
        const { key, columns, ...rest } = board;
        return [
          String(key),
          Array.isArray(columns)
            ? {
                ...rest,
                columns: Object.fromEntries(
                  columns.map((column: Values) => [column['name'], column['formula']]),
                ),
              }
            : rest,
        ];
      }),
    );
  return data;
}

/** Settings as the server answers them for a form, read at `token`. */
export function settingsOf(
  values: Values,
  token: string,
): components['schemas']['Settings'] {
  return { values, unreadable: null, token, version: 'v0' };
}

/** A workflow's draft as the server answers it, read from `text` at `token`. */
export function workflowDraftOf(
  text: string,
  token: string,
): components['schemas']['WorkflowDraft'] {
  const values = parse(text, { version: '1.2', schema: 'core' }) as Values;
  return { values, unreadable: null, content: null, token, revision: null };
}

/** A workflow version's file as the server answers it: its text and its values. */
export function workflowVersionOf(
  text: string,
): components['schemas']['VersionContent'] {
  const values = parse(text, { version: '1.2', schema: 'core' }) as Values;
  return { content: text, values, unreadable: null };
}
