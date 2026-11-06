import type { Workflow } from './model';

/** What a box stands for: a step, an input, a file of the workflow, the outputs. */
export type Selected =
  | { kind: 'step'; index: number }
  | { kind: 'input'; id: string }
  | { kind: 'file'; path: string }
  | { kind: 'outputs' }
  // Every file of the workflow, opened from the bar: no box stands for it.
  | { kind: 'files' };

/**
 * What a box stands for, as a selection, by its key, or null for a key that
 * stands for nothing. An input or a file a step reads may not be drawn, so
 * its key is read, not its box.
 */
export function selectionOf(key: string | null | undefined): Selected | null {
  if (key === null || key === undefined) return null;
  if (key === 'outputs') return { kind: 'outputs' };
  if (key === 'files') return { kind: 'files' };
  const at = key.indexOf(':');
  const kind = key.slice(0, at);
  const rest = key.slice(at + 1);
  if (at < 0 || rest === '') return null;
  if (kind === 'step' && /^\d+$/.test(rest))
    return { kind: 'step', index: Number(rest) };
  if (kind === 'input') return { kind: 'input', id: rest };
  if (kind === 'file') return { kind: 'file', path: rest };
  return null;
}

/** The title of the drawer that shows `selected`, or null while nothing is. */
export function drawerTitle(
  selected: Selected | null,
  workflow: Workflow,
): string | null {
  if (selected === null) return null;
  if (selected.kind === 'step')
    return `Step ${workflow.steps[selected.index]?.id || '(no name)'}`;
  if (selected.kind === 'input') return 'Inputs';
  if (selected.kind === 'file') return 'Workflow file';
  if (selected.kind === 'files') return 'Files';
  return 'Outputs';
}
