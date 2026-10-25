import { apiClient } from '@/api/client';
import { exactJS, isRecord, parseYaml, writeAt, writeOver } from '../forms/yaml-doc';
import { declaredOf, refParts } from './build-data';

/** The workflow a new task is created on, until its first save names another. */
export const STARTER = 'unicon/classic@v3';

/** The workflow a new task should move onto, empty until one is chosen. */
export type Kind = { workflow: string };

export const FIRST_KIND: Kind = { workflow: '' };

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}';

/**
 * A task just made, set to grade with `workflow` in place of the starter's,
 * in its first save: the settings name the workflow, keep the starter's
 * inputs the workflow also has, and drop the others. The starter's runs
 * stay, as the first to replace.
 */
export async function startOn(
  where: { org: string; contest: string; task: string },
  workflow: string,
): Promise<void> {
  const parts = refParts(workflow);
  if (parts === null) throw new Error(`There is no workflow called ${workflow}.`);
  const { data: version } = await apiClient.GET(
    '/api/v1/workflows/{owner}/{name}/versions/{version}',
    { params: { path: parts } },
  );
  const declared = version === undefined ? null : declaredOf(version.content);
  const { data: file } = await apiClient.GET(`${TASK}/files/{path}`, {
    params: { path: { ...where, path: 'task.yaml' } },
  });
  if (file === undefined) throw new Error('The new task’s settings could not be read.');
  const parsed = parseYaml(file.content);
  if ('error' in parsed) throw new Error(parsed.error);
  const { doc } = parsed;
  writeAt(doc, ['workflow'], workflow);
  const top = exactJS(doc);
  const given = isRecord(top) && isRecord(top['inputs']) ? top['inputs'] : {};
  for (const id of Object.keys(given)) {
    const kept = declared?.inputs.find((input) => input.id === id);
    if (kept === undefined) {
      writeAt(doc, ['inputs', id], undefined, { prune: true });
      continue;
    }
    // An entrant's choice keeps only the options the new workflow has.
    const entry = given[id];
    const details = isRecord(entry) ? entry['entrant'] : undefined;
    if (
      kept.type === 'enum' &&
      isRecord(details) &&
      Array.isArray(details['options'])
    ) {
      const left = (details['options'] as unknown[]).filter(
        (option) => typeof option === 'string' && (kept.options ?? []).includes(option),
      );
      writeAt(
        doc,
        ['inputs', id, 'entrant', 'options'],
        left.length === 0 ? undefined : left,
        { prune: true },
      );
    }
  }
  await apiClient.POST(`${TASK}/save`, {
    params: { path: where },
    body: {
      changes: [
        {
          path: 'task.yaml',
          token: file.token,
          content: writeOver(file.content, doc),
          encoding: 'utf-8',
          remove: false,
        },
      ],
      confirm: false,
      keep_as_draft: false,
    },
  });
}
