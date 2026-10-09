import { isMap, isSeq, LineCounter, parseDocument, type Node } from 'yaml';
import type { LineRange } from '@/ui/CodeEditor';

/**
 * The lines of `workflow.yaml` a box stands for, so selecting the box marks
 * them in the preview: a step's item, an input's or a field's entry, the
 * report. Read from the document's own node ranges, so the lines are the
 * file's as it is written, comments and all.
 */
export type Selected =
  | { kind: 'step'; index: number }
  | { kind: 'inputs'; ids: string[] }
  | { kind: 'test'; names: string[] }
  | { kind: 'report' };

export function linesOf(text: string, selected: Selected | null): LineRange[] {
  if (selected === null) return [];
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter });
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
  if (selected.kind === 'inputs') return pairsOf('inputs', selected.ids);
  if (selected.kind === 'test') return pairsOf('test', selected.names);
  const report: unknown = doc.get('report', true);
  return isMap(report) ? ofNode(report) : [];
}
