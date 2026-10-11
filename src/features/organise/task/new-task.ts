import { apiClient } from '@/api/client';
import type { WorkflowItem } from '@/api/types';
import { exactJS, isRecord, parseYaml, writeAt, writeOver } from '../forms/yaml-doc';
import { declaredOf, refParts } from './build-data';

/**
 * The kinds of task New task starts from, each a workflow the platform seeds:
 * the starter's, comparing a program's output with each test's answer, and a
 * program of several files graded the same way. Any other workflow the
 * organiser may read is chosen by name. The kinds of TASK-FORMAT section 4
 * whose workflows are not built yet are not offered.
 */
export const KINDS = [
  {
    value: 'classic',
    workflow: 'unicon/classic@v2',
    label: 'Compare output with an answer',
    line: 'Entrants submit one source file. Each test runs it on an input and compares what it prints with the answer.',
  },
  {
    value: 'folder',
    workflow: 'unicon/classic-folder@v1',
    label: 'A program of several files',
    line: 'Entrants submit a folder of source files and name the one that runs first; each test is graded as above.',
  },
  {
    value: 'other',
    workflow: null,
    label: 'Start from another workflow',
    line: 'Any workflow you may read, chosen by name and version.',
  },
] as const;

/** The workflow a new task starts on unless told otherwise: the starter's. */
export const STARTER = 'unicon/classic@v2';

/** The kind a new task starts as, and the workflow that kind grades with. */
export type Kind = { kind: (typeof KINDS)[number]['value']; workflow: string };

export const FIRST_KIND: Kind = { kind: 'classic', workflow: STARTER };

/** Whether the organiser may read a workflow at a version, from the list of those they may. */
export function readable(items: WorkflowItem[], ref: string): boolean {
  const parts = refParts(ref);
  return (
    parts !== null &&
    items.some(
      (item) =>
        item.owner === parts.owner &&
        item.name === parts.name &&
        item.versions.includes(parts.version),
    )
  );
}

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}';

/**
 * A task just made, set to grade with `workflow` in place of the starter's,
 * in its first save: the settings name the workflow, keep the starter's
 * inputs the workflow also has, and drop the others. The starter's test
 * stays, as the first test to replace.
 */
export async function startOn(
  where: { org: string; contest: string; task: string },
  workflow: string,
): Promise<void> {
  const parts = refParts(workflow);
  if (parts === null) throw new Error(`${workflow} names no workflow.`);
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
    // A choice keeps only the options the new workflow has.
    const options = given[id];
    if (
      kept.type === 'enum' &&
      isRecord(options) &&
      Array.isArray(options['options'])
    ) {
      const left = (options['options'] as unknown[]).filter(
        (option) => typeof option === 'string' && (kept.options ?? []).includes(option),
      );
      writeAt(doc, ['inputs', id, 'options'], left.length === 0 ? undefined : left, {
        prune: true,
      });
    }
  }
  for (const input of declared?.inputs ?? []) {
    if (
      input.contestant &&
      (input.type === 'file' || input.type === 'folder') &&
      !(input.id in given)
    ) {
      writeAt(doc, ['inputs', input.id], {
        label: `Your ${input.title?.toLowerCase() ?? input.id}`,
      });
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
