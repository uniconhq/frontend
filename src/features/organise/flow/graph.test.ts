import { expect, it } from 'vitest';
import {
  layoutGraph,
  wirePath,
  TASK_PALETTE,
  RESULT_ROW,
  HEAD,
  STACK,
  type GraphBox,
} from './graph';
it('keeps Result open and lands each wire on its own row', () => {
  const boxes: GraphBox[] = [
    {
      id: 'points',
      title: 'points',
      kind: 'number',
      role: 'input',
      ports: [{ name: 'points', side: 'out' }],
    },
    {
      id: 'result',
      title: 'Result',
      kind: 'what the entrant gets',
      role: 'output',
      wide: 320,
      alwaysOpen: true,
      rowHeight: RESULT_ROW,
      ports: [
        { name: 'heading', side: 'in', heading: true },
        { name: 'points', side: 'in' },
        { name: 'small', side: 'in', rows: 3 },
      ],
    },
  ];
  const wires = [
    { from: 'points', fromPort: 'points', to: 'result', toPort: 'points' },
  ];
  const layout = layoutGraph(boxes, wires, null, {
    shape: { width: 160, gap: 40 },
    palette: TASK_PALETTE,
    insides: new Map(),
  });
  const [from, to] = layout.placed;
  if (from === undefined || to === undefined) throw new Error('missing boxes');
  expect(to.width).toBe(320);
  expect(to.height).toBeGreaterThan(HEAD + 5 * RESULT_ROW);
  const y = to.y + STACK + 2 + HEAD + RESULT_ROW + RESULT_ROW / 2;
  expect(wirePath(layout, wires[0]!, from, to, null)).toContain(String(y));
});
