import type { Box } from './layout';
import type { Ref, Workflow } from './model';

/**
 * The two ends of a wire as the graph draws them: the source a box's
 * right-hand port stands for, and the target a box's left-hand port stands
 * for, a step's port or the report, where `+` is an entry not made yet.
 */

/** Where a wire would go: a step's port, or the report (an entry, or a new one). */
export type Target =
  | { kind: 'port'; step: number; port: string }
  | { kind: 'report'; entry: string | null };

/** A refusal said at the port a wire was dropped on. */
export type Notice = { box: string; port: string; reason: string };

export function sourceAt(box: Box, port: string, workflow: Workflow): Ref | null {
  if (box.kind === 'inputs') return { kind: 'inputs', name: port };
  if (box.kind === 'test') return { kind: 'test', name: port };
  if (box.kind === 'step' && box.step !== null) {
    const step = workflow.steps[box.step];
    return step !== undefined ? { kind: 'steps', name: step.id, output: port } : null;
  }
  return null;
}

export function targetAt(box: Box, port: string): Target | null {
  if (box.kind === 'step' && box.step !== null)
    return { kind: 'port', step: box.step, port };
  if (box.kind === 'report')
    return { kind: 'report', entry: port === '+' ? null : port };
  return null;
}
