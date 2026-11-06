import type { SaveChange } from '@/api/types';
import type { Box } from './layout';
import type { Ref, Workflow } from './model';

/** A `step` is a drop on the box; `portFor` picks its port. */
export type Target =
  | { kind: 'port'; step: number; port: string }
  | { kind: 'step'; step: number }
  | { kind: 'outputs'; entry: string | null };

/** `count` separates one drop from the next, so the same refusal starts its time again. */
export type Notice = { box: string; port: string; reason: string; count: number };

export function sourceAt(box: Box, port: string, workflow: Workflow): Ref | null {
  if (box.kind === 'input') return { kind: 'inputs', name: port };
  if (box.kind === 'file') return { kind: 'workflow', name: port };
  if (box.kind === 'step' && box.step !== null) {
    const step = workflow.steps[box.step];
    return step !== undefined ? { kind: 'steps', name: step.id, output: port } : null;
  }
  return null;
}

export type Drop = { target: Target; box: string; port: string };

export type PortTarget = Exclude<Target, { kind: 'step' }>;

/** `+` is an output not made yet. */
export function targetAt(box: Box, port: string): PortTarget | null {
  if (box.kind === 'step' && box.step !== null)
    return { kind: 'port', step: box.step, port };
  if (box.kind === 'outputs')
    return { kind: 'outputs', entry: port === '+' ? null : port };
  return null;
}

/** A drop on the box itself, not on a port. */
export function targetOf(box: Box): Target | null {
  if (box.kind === 'step' && box.step !== null) return { kind: 'step', step: box.step };
  if (box.kind === 'outputs') return { kind: 'outputs', entry: null };
  return null;
}

/** Includes every folder that holds one. */
export function workflowSources(
  paths: readonly string[],
  changes: readonly SaveChange[],
): Ref[] {
  const files = new Set(paths);
  for (const change of changes) {
    if (change.remove) files.delete(change.path);
    else files.add(change.path);
  }
  const sources = new Set<string>();
  for (const path of files) {
    if (path === 'workflow.yaml') continue;
    sources.add(path);
    const parts = path.split('/');
    for (let at = 1; at < parts.length; at += 1)
      sources.add(`${parts.slice(0, at).join('/')}/`);
  }
  return [...sources]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => ({ kind: 'workflow', name }));
}
