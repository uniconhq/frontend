import { expect, it } from 'vitest';
import {
  HEAD,
  RESULT_ROW,
  STACK,
  TASK_PALETTE,
  layoutGraph,
  type GraphBox,
} from './graph';

it('keeps Result open and lands each wire on its own row', () => {
  const boxes: GraphBox[] = [
    {
      id: 'points',
      role: 'input',
      ports: [{ name: 'points', side: 'out' }],
    },
    {
      id: 'result',
      role: 'output',
      wide: 320,
      open: true,
      rowHeight: RESULT_ROW,
      ports: [
        { name: 'heading', side: 'in', heading: true },
        { name: 'points', side: 'in' },
        { name: 'small', side: 'in', rows: 3 },
      ],
    },
  ];
  const layout = layoutGraph(
    boxes,
    [{ from: 'points', fromPort: 'points', to: 'result', toPort: 'points' }],
    { shape: { width: 160, gap: 40 }, palette: TASK_PALETTE },
  );
  const to = layout.boxes.find((placed) => placed.box.id === 'result');
  if (to === undefined) throw new Error('missing Result');
  expect(to.width).toBe(320);
  expect(to.height).toBeGreaterThan(HEAD + 5 * RESULT_ROW);
  expect(layout.wires[0]?.points.at(-1)).toEqual({
    x: to.x,
    y: to.y + STACK + 2 + HEAD + RESULT_ROW + RESULT_ROW / 2,
  });
});

it('orders a column to cut the crossings, and runs a skipping wire through a slot', () => {
  const wire = (from: string, to: string) => ({
    from,
    fromPort: from,
    to,
    toPort: from,
  });
  const box = (id: string, more: Partial<GraphBox> = {}): GraphBox => ({
    id,
    ports: [
      { name: 'a', side: 'in' },
      { name: 'b', side: 'in' },
      { name: id, side: 'out' },
    ],
    ...more,
  });
  // Listed so that, kept in that order, b's and a's wires would cross.
  const layout = layoutGraph(
    [
      box('a', { role: 'input' }),
      box('b', { role: 'input' }),
      box('fromB'),
      box('fromA'),
      box('end', { role: 'output' }),
    ],
    [wire('a', 'fromA'), wire('b', 'fromB'), wire('fromA', 'end'), wire('a', 'end')],
    { shape: { width: 160, gap: 40 }, palette: TASK_PALETTE },
  );
  expect(layout.crossings).toBe(0);
  const column = (id: string) =>
    layout.boxes.find((placed) => placed.box.id === id)?.column;
  expect([column('a'), column('fromA'), column('end')]).toEqual([0, 1, 2]);
  expect(layout.slots.map((slot) => [slot.from, slot.fromPort, slot.column])).toEqual([
    ['a', 'a', 1],
  ]);
  expect(layout.wires.find((found) => found.wire.to === 'end')?.colour).toBe(
    TASK_PALETTE.middle[0],
  );
});

it('draws a wire a cycle turns backwards round under both boxes', () => {
  const layout = layoutGraph(
    [
      {
        id: 'x',
        ports: [
          { name: 'y', side: 'in' },
          { name: 'x', side: 'out' },
        ],
      },
      {
        id: 'y',
        ports: [
          { name: 'x', side: 'in' },
          { name: 'y', side: 'out' },
        ],
      },
    ],
    [
      { from: 'x', fromPort: 'x', to: 'y', toPort: 'x' },
      { from: 'y', fromPort: 'y', to: 'x', toPort: 'y' },
    ],
    { shape: { width: 160, gap: 40 }, palette: TASK_PALETTE },
  );
  const column = (id: string) =>
    layout.boxes.find((placed) => placed.box.id === id)?.column ?? 0;
  const back = layout.wires.find(
    (found) => column(found.wire.to) <= column(found.wire.from),
  );
  const lowest = Math.max(...layout.boxes.map((placed) => placed.y + placed.height));
  expect(back?.points).toHaveLength(4);
  expect(back?.points[1]?.y).toBeGreaterThan(lowest);
});
