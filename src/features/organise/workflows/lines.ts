import { isMap, isSeq, LineCounter, parseDocument, type Node } from 'yaml';
import type { LineRange } from '@/ui/CodeEditor';
import { YAML_OPTIONS } from '../forms/yaml-doc';
import type { Workflow } from './model';

/**
 * The lines of `workflow.yaml` a box stands for, so selecting the box marks
 * them in the preview: a step's item, an input's entry, the outputs. Read from the document's own node ranges, so the lines are the
 * file's as it is written, comments and all.
 */
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

export function linesOf(text: string, selected: Selected | null): LineRange[] {
  if (selected === null) return [];
  const counter = new LineCounter();
  const doc = parseDocument(text, { ...YAML_OPTIONS, lineCounter: counter });
  if (doc.errors.length > 0 || !isMap(doc.contents)) return [];
  const span = (from: number, to: number): LineRange => ({
    from: counter.linePos(from).line,
    to: counter.linePos(Math.max(from, to - 1)).line,
  });
  const ofNode = (node: Node | null | undefined): LineRange[] =>
    node?.range ? [span(node.range[0], node.range[1])] : [];
  const pairsOf = (section: string, keys: string[]): LineRange[] => {
    const map: unknown = doc.get(section, true);
    if (!isMap(map)) return [];
    return map.items.flatMap((pair) => {
      const key = pair.key as Node | null;
      const value = pair.value as Node | null;
      const name =
        key && 'value' in key ? String((key as { value: unknown }).value) : '';
      if (!keys.includes(name) || !key?.range) return [];
      return [span(key.range[0], value?.range ? value.range[1] : key.range[1])];
    });
  };
  if (selected.kind === 'step') {
    const steps: unknown = doc.get('steps', true);
    return isSeq(steps) ? ofNode(steps.items[selected.index] as Node | undefined) : [];
  }
  if (selected.kind === 'input') return pairsOf('inputs', [selected.id]);
  // A file of the workflow has no lines of its own: the ports that read it say it.
  if (selected.kind === 'file' || selected.kind === 'files') return [];
  const outputs: unknown = doc.get('outputs', true);
  return isMap(outputs) ? ofNode(outputs) : [];
}
