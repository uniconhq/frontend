import { useMemo } from 'react';
import { useIsFetching, useQueries } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { $api } from '@/api/query';
import type { Visibility, WorkflowBox } from '@/api/types';
import { exactJS, parseYaml } from '../forms/yaml-doc';
import type { StepPorts } from './layout';
import { readWorkflow, type Workflow } from './model';
import type { PrimitiveInfo } from './primitives';

/** A workflow a step uses, `owner/name@version`. */
export type UseRef = { owner: string; name: string; version: string };

/** One input or output of a run workflow drawn as a box. */
export type BoxDecl = {
  run: boolean;
  newer: string | null;
  description: string | null;
  inputs: { name: string; type: string; optional: boolean; options: string[] | null }[];
  outputs: { name: string; type: string | null }[];
};

/**
 * Where Open has gone: a workflow, the step that opened it, the steps of a
 * problem's path still inside it, and the box to show selected there, by
 * its key, when Inside goes back up to it.
 */
export type Frame = { use: UseRef; title: string; rest: string[]; mark: string | null };

/** A run workflow the tray can place, at one version, with who reads it. */
export type PaletteWorkflow = UseRef & { visibility: Visibility };

export function formatUse(use: UseRef): string {
  return `${use.owner}/${use.name}@${use.version}`;
}

/** `owner/name@version`, or null when `ref` is not one. */
export function parseUse(ref: string): UseRef | null {
  const match = /^([^/\s]+)\/([^@\s]+)@([^/\s]+)$/.exec(ref);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined)
    return null;
  return { owner: match[1], name: match[2], version: match[3] };
}

function declOf(box: WorkflowBox): BoxDecl {
  return {
    run: box.run,
    newer: box.newer_version,
    description: box.description,
    inputs: box.inputs.map((input) => ({
      name: input.name,
      type: input.type,
      optional: input.optional,
      options: input.options,
    })),
    outputs: box.outputs.map((output) => ({ name: output.name, type: output.type })),
  };
}

export function boxOptions(use: UseRef) {
  return $api.queryOptions(
    'get',
    '/api/v1/workflows/{owner}/{name}/versions/{version}/box',
    { params: { path: use } },
  );
}

export function versionOptions(use: UseRef) {
  return $api.queryOptions(
    'get',
    '/api/v1/workflows/{owner}/{name}/versions/{version}',
    { params: { path: use } },
  );
}

/**
 * The boxes the page has read, by the reference a step uses. A test-format
 * workflow answers `run` false and is left out: it is not a box. The map
 * keeps its identity until a box's answer changes, so the graph is not drawn
 * again on every render.
 */
export function useBoxes(refs: readonly UseRef[]): Map<string, BoxDecl> {
  const reads = useQueries({
    queries: refs.map((use) => ({ ...boxOptions(use), retry: false })),
  });
  const stamp = reads
    .map((read) => (read.data === undefined ? '' : JSON.stringify(declOf(read.data))))
    .join('\n');
  return useMemo(() => {
    const found = new Map<string, BoxDecl>();
    refs.forEach((use, index) => {
      const data = reads[index]?.data;
      if (data === undefined || !data.run) return;
      found.set(formatUse(use), declOf(data));
    });
    return found;
    // `stamp` is the answers; `reads` is a new array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs, stamp]);
}

/** The ports of each run workflow's box, as the layout draws them. */
export function portsOf(boxes: ReadonlyMap<string, BoxDecl>): Map<string, StepPorts> {
  const found = new Map<string, StepPorts>();
  for (const [use, box] of boxes)
    found.set(use, {
      inputs: box.inputs.map((input) => input.name),
      outputs: box.outputs.map((output) => output.name),
    });
  return found;
}

/**
 * Whether any workflow's box is being read for the first time: one read
 * again in the background, as on the window's focus, already has its answer.
 */
export function useReadingBoxes(): boolean {
  return (
    useIsFetching({
      queryKey: ['get', '/api/v1/workflows/{owner}/{name}/versions/{version}/box'],
      predicate: (query) => query.state.data === undefined,
    }) > 0
  );
}

/** A version's file read as a workflow, forgiving one with problems. */
export function workflowFrom(content: string): Workflow {
  const parsed = parseYaml(content);
  return readWorkflow('error' in parsed ? null : exactJS(parsed.doc));
}

/** The boxes of the run workflows a workflow's steps use, as they are read. */
export function useStepBoxes(
  workflow: Workflow | null,
  primitives: Map<string, PrimitiveInfo>,
): Map<string, BoxDecl> {
  const uses = useMemo(
    () =>
      (workflow?.steps ?? []).flatMap((step) => {
        const parsed = primitives.has(step.use) ? null : parseUse(step.use);
        return parsed === null ? [] : [parsed];
      }),
    [workflow, primitives],
  );
  return useBoxes(uses);
}

/**
 * The boxes a problem's step path opens, outermost first. The last frame's
 * `rest` is the step to mark. Null when the path is not inside a box.
 */
export async function framesFor(
  path: string,
  workflow: Workflow,
  primitives: Map<string, PrimitiveInfo>,
): Promise<Frame[] | null> {
  const parts = path.split('/').filter((part) => part !== '');
  if (parts.length < 2) return null;
  const frames: Frame[] = [];
  let current = workflow;
  for (let at = 0; at < parts.length - 1; at += 1) {
    const id = parts[at] ?? '';
    const step = current.steps.find((item) => item.id === id);
    const use = step === undefined ? null : parseUse(step.use);
    if (step === undefined || use === null || primitives.has(step.use))
      return frames.length > 0 ? frames : null;
    frames.push({ use, title: step.id, rest: parts.slice(at + 1), mark: null });
    if (at === parts.length - 2) break;
    const { data } = await apiClient.GET(
      '/api/v1/workflows/{owner}/{name}/versions/{version}',
      { params: { path: use } },
    );
    if (data === undefined) break;
    current = workflowFrom(data.content);
  }
  return frames;
}
