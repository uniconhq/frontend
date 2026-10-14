import { useQueries, useQuery } from '@tanstack/react-query';
import { $api, queryView, type QueryView } from '@/api/query';
import type {
  DeclaredField,
  DeclaredInput,
  FileContent,
  TreeEntry,
  WorkflowForm,
} from '@/api/types';
import { ratioOf, type Ratio } from '@/lib/exact';
import { EDITED } from '@/live';
import { useContestSettings } from '../contest/settings';
import { treeQuery, type Place } from '../files/place';
import { exactJS, isRecord, parseYaml, topMap, type Doc } from '../forms/yaml-doc';
import { readWorkflow, type ReportEntry } from '../workflows/model';

export type TaskPlace = Extract<Place, { kind: 'task' }>;

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}';

/** The task's own address parts, for the routes under it. */
export function taskPath(place: TaskPlace) {
  return { org: place.org, contest: place.contest, task: place.task };
}

/**
 * What the task's workflow says the task's form is made of: its inputs, the
 * fields each test has, and what a run reports, which says what a test may
 * earn by.
 */
export type Declared = {
  inputs: DeclaredInput[];
  test: DeclaredField[];
  report: ReportedValue[];
};

/**
 * A value a run reports, with whether it is reported for each test: read
 * from a step that runs for each test, as the forge has it.
 */
export type ReportedValue = ReportEntry & { perTest: boolean };

/**
 * An input as the organiser's form names it: its title, or its id (#434),
 * and a number's unit after it. A unit on another type, left by a version
 * made before a unit was for a number alone (M54), is not shown.
 */
export function inputTitle(
  input: Pick<DeclaredInput, 'id' | 'title' | 'unit' | 'type'>,
): string {
  const title = input.title ?? input.id;
  return input.unit === null || input.type !== 'number'
    ? title
    : `${title} (${input.unit})`;
}

/** The settings file as a document the cards can show, or why it is not one. */
export function readSettings(file: FileContent): { doc: Doc } | { error: string } {
  if (file.encoding !== 'utf-8') return { error: 'The file is not text.' };
  const parsed = parseYaml(file.content);
  if ('error' in parsed) return parsed;
  return topMap(parsed.doc) === 'not-a-mapping'
    ? { error: 'The file does not hold a list of settings.' }
    : parsed;
}

/** A workflow named as a task names it, `owner/name@version`, split; null when it is not one. */
export function refParts(
  ref: string,
): { owner: string; name: string; version: string } | null {
  const found = /^([^/@\s]+)\/([^/@\s]+)@([^/@\s]+)$/.exec(ref.trim());
  if (found === null) return null;
  const [, owner = '', name = '', version = ''] = found;
  return { owner, name, version };
}

/** A version's `workflow.yaml` as what a task's form is made of, or null when it does not read. */
export function declaredOf(text: string): Declared | null {
  const parsed = parseYaml(text);
  if ('error' in parsed) return null;
  const raw = exactJS(parsed.doc);
  if (!isRecord(raw)) return null;
  const workflow = readWorkflow(raw);
  return {
    inputs: workflow.inputs.map((input) => ({
      id: input.id,
      type: input.type,
      contestant: input.contestant,
      options: input.options,
      per_test: input.perTest,
      optional: input.optional,
      title: input.title,
      help: input.help,
      unit: input.unit,
    })),
    test: workflow.test.map((field) => ({
      name: field.name,
      type: field.type,
      options: field.options,
    })),
    report: workflow.report.map((entry) => ({
      ...entry,
      perTest:
        entry.from?.kind === 'steps' &&
        workflow.steps.some((step) => step.id === entry.from?.name && step.perTest),
    })),
  };
}

/**
 * The inputs and test fields the task's saved workflow declares, as the
 * backend reads them, with whether the task has graded submissions and
 * whether a newer version is out. Read afresh each time the page opens and
 * after each save, never while the organiser types. `built` reads it for the
 * build cards (`builtFrom`).
 */
export function useWorkflowForm(place: TaskPlace, built = false) {
  const options = $api.queryOptions(
    'get',
    `${TASK}/workflow-form`,
    { params: { path: taskPath(place) } },
    {
      retry: false,
      staleTime: 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );
  return useQuery(built ? builtFrom(options) : options);
}

/**
 * A read as the task's build cards make it: under a key of its own, which
 * the re-read when the live stream opens again passes over (`EDITED`), so
 * coming back to the tab never builds the cards again over what the
 * organiser has changed. The rest of the page reads the same route under its
 * plain key, kept up to date; a save reads both again, its key being the
 * start of this one.
 */
function builtFrom<T extends { queryKey: readonly unknown[] }>(options: T) {
  return { ...options, queryKey: [...options.queryKey, 'build'], meta: EDITED };
}

/** One version's `workflow.yaml`, which never changes once made. */
export function useWorkflowVersion(ref: string | null) {
  const parts = ref === null ? null : refParts(ref);
  return $api.useQuery(
    'get',
    '/api/v1/workflows/{owner}/{name}/versions/{version}',
    { params: { path: parts ?? { owner: '', name: '', version: '' } } },
    { enabled: parts !== null, staleTime: Infinity, retry: false },
  );
}

/** The workflows the organiser may read, each with its versions. */
export function useWorkflowList() {
  return $api.useQuery('get', '/api/v1/workflows', {}, { staleTime: 60_000 });
}

/** The platform's primitives, for drawing a workflow's steps. */
export function usePrimitives() {
  return $api.useQuery('get', '/api/v1/primitives', {}, { staleTime: 5 * 60_000 });
}

/** The latest version of a workflow by its number, from its listed versions. */
export function newestOf(versions: readonly string[]): string | null {
  let best: string | null = null;
  let highest = -1;
  for (const version of versions) {
    const found = /^v([1-9][0-9]*)$/.exec(version);
    const number = found?.[1] === undefined ? 0 : Number(found[1]);
    if (number > highest) {
      highest = number;
      best = version;
    }
  }
  return best;
}

/** Folder names in natural order, `2` before `10`, as the format orders tests. */
export function naturally(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/** The last part of a path: `tests/small/3` is `3`. */
export function lastPart(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** One test group's folder: its tests by name, and files that are in no test. */
export type GroupFolder = { name: string; tests: string[]; strays: string[] };

/**
 * The test groups the task's `tests/` folder holds, each with its tests, in
 * the order the format reads them. One read for `tests/` and one per group,
 * since a folder's listing is one level deep. `built` reads them for the
 * build cards (`builtFrom`).
 */
export function useTestFolders(
  place: TaskPlace,
  built = false,
): QueryView<GroupFolder[]> {
  const read = <T extends { queryKey: readonly unknown[] }>(options: T) =>
    built ? builtFrom(options) : options;
  const top = useQuery({ ...read(treeQuery(place, 'tests')), retry: false });
  const folders = (top.data ?? [])
    .filter((entry) => entry.kind === 'directory')
    .map((entry) => lastPart(entry.path));
  const groups = useQueries({
    queries: folders.map((group) => ({
      ...read(treeQuery(place, `tests/${group}`)),
      retry: false,
    })),
  });
  if (top.isPending) return { state: 'loading' };
  // A task with no tests/ folder yet has no groups: the read finds no folder.
  if (top.isError) {
    const view = queryView(top);
    if (view.state === 'error' && view.error.code === 'not_found') {
      return { state: 'ready', data: [] };
    }
    return view.state === 'error' ? view : { state: 'loading' };
  }
  const failed = groups.find((group) => group.isError);
  if (failed !== undefined) {
    const view = queryView(failed);
    if (view.state === 'error') return view;
  }
  if (groups.some((group) => group.isPending)) return { state: 'loading' };
  return {
    state: 'ready',
    data: folders.map((name, at) => {
      const entries: TreeEntry[] = groups[at]?.data ?? [];
      return {
        name,
        tests: entries
          .filter((entry) => entry.kind === 'directory')
          .map((entry) => lastPart(entry.path))
          .sort(naturally),
        strays: entries
          .filter((entry) => entry.kind !== 'directory')
          .map((entry) => lastPart(entry.path)),
      };
    }),
  };
}

/**
 * What the task's contest makes it worth: the `worth` of its entry, or null
 * when the entry gives none and the task is worth its groups' total (#435).
 * `known` is false when the contest's settings cannot be read, as by an
 * organiser of the task alone.
 */
export function useTaskWorth(place: TaskPlace): {
  known: boolean;
  worth: Ratio | null;
} {
  const view = useContestSettings(place.org, place.contest);
  if (view.state !== 'ready' || view.data === null)
    return { known: false, worth: null };
  const entry = view.data.tasks.find((task) => task.id === place.task);
  const text = entry?.worth.trim() ?? '';
  return { known: entry !== undefined, worth: text === '' ? null : ratioOf(text) };
}

/** What the workflow form says, or null when the backend could not say it. */
export function formOf(form: {
  data?: WorkflowForm;
  isError: boolean;
}): WorkflowForm | null {
  return form.isError ? null : (form.data ?? null);
}
