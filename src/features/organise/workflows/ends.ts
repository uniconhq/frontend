import type { SaveChange } from '@/api/types';
import type { Box } from './layout';
import type { Ref, Workflow } from './model';

/**
 * The two ends of a wire as the graph draws them: the source a box's
 * right-hand port stands for, and the target a box's left-hand port stands
 * for, a step's port or the outputs, where `+` is an output not made yet.
 */

/** Where a wire would go: a step's port, or the outputs (one, or a new one). */
export type Target =
  | { kind: 'port'; step: number; port: string }
  | { kind: 'outputs'; entry: string | null };

/**
 * A refusal said at the box of the port a wire was dropped on. `count`
 * tells one drop from the next, so the same refusal said again starts its
 * time again.
 */
export type Notice = { box: string; port: string; reason: string; count: number };

export function sourceAt(box: Box, port: string, workflow: Workflow): Ref | null {
  if (box.kind === 'inputs') return { kind: 'inputs', name: port };
  if (box.kind === 'step' && box.step !== null) {
    const step = workflow.steps[box.step];
    return step !== undefined ? { kind: 'steps', name: step.id, output: port } : null;
  }
  return null;
}

export function targetAt(box: Box, port: string): Target | null {
  if (box.kind === 'step' && box.step !== null)
    return { kind: 'port', step: box.step, port };
  if (box.kind === 'outputs')
    return { kind: 'outputs', entry: port === '+' ? null : port };
  return null;
}

/** Saved and staged workflow files, and every folder that holds one. */
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
