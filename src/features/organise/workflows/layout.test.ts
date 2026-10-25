import { describe, expect, it } from 'vitest';
import { parseYaml } from '../forms/yaml-doc';
import { CLASSIC, FOLDER, PRIMITIVES } from '@/test/workflows';
import {
  layoutWorkflow,
  rowOf,
  wirePath,
  type Box,
  type Layout,
  type Point,
} from './layout';
import { readWorkflow } from './model';
import { byRef } from './primitives';

const primitives = byRef(PRIMITIVES);

/** The layout of a file read as the editor reads it, YAML 1.1. */
function laid(text: string): Layout {
  const parsed = parseYaml(text);
  if ('error' in parsed) throw new Error(parsed.error);
  return layoutWorkflow(readWorkflow(parsed.doc.toJS()), primitives);
}

/** Points along the path `wirePath` draws for a wire: each line and each curve. */
function along(points: Point[]): Point[] {
  const words = wirePath(points).split(' ');
  const found: Point[] = [];
  let at = { x: 0, y: 0 };
  const number = (index: number) => Number(words[index]);
  for (let index = 0; index < words.length;) {
    const command = words[index];
    if (command === 'M') {
      at = { x: number(index + 1), y: number(index + 2) };
      found.push(at);
      index += 3;
    } else if (command === 'L') {
      const end = { x: number(index + 1), y: number(index + 2) };
      for (let step = 1; step <= 40; step += 1)
        found.push({
          x: at.x + ((end.x - at.x) * step) / 40,
          y: at.y + ((end.y - at.y) * step) / 40,
        });
      at = end;
      index += 3;
    } else if (command === 'C') {
      const [x1, y1, x2, y2, x, y] = [1, 2, 3, 4, 5, 6].map((offset) =>
        number(index + offset),
      );
      for (let step = 1; step <= 40; step += 1) {
        const t = step / 40;
        const u = 1 - t;
        const weigh = (p0: number, p1: number, p2: number, p3: number) =>
          u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
        found.push({
          x: weigh(at.x, x1 ?? 0, x2 ?? 0, x ?? 0),
          y: weigh(at.y, y1 ?? 0, y2 ?? 0, y ?? 0),
        });
      }
      at = { x: x ?? 0, y: y ?? 0 };
      index += 7;
    } else
      throw new Error(
        `wirePath wrote ${String(command)}, which this test does not read`,
      );
  }
  return found;
}

function inside(point: Point, box: Box): boolean {
  return (
    point.x > box.x + 0.5 &&
    point.x < box.x + box.width - 0.5 &&
    point.y > box.y + 0.5 &&
    point.y < box.y + box.height - 0.5
  );
}

/** Every wire that passes behind a box, by its key. */
function behind(layout: Layout): string[] {
  return layout.wires
    .filter((wire) =>
      along(wire.points).some((point) =>
        layout.boxes.some((box) => inside(point, box)),
      ),
    )
    .map((wire) => wire.key);
}

/** Every two things of one column that overlap. */
function overlaps(layout: Layout): string[] {
  const things = [
    ...layout.boxes.map((box) => ({
      key: box.key,
      column: box.column,
      y: box.y,
      height: box.height,
    })),
    ...layout.slots.map((slot) => ({
      key: slot.key,
      column: slot.column,
      y: slot.y,
      height: slot.height,
    })),
  ];
  const found: string[] = [];
  for (const one of things)
    for (const two of things)
      if (
        one.key < two.key &&
        one.column === two.column &&
        one.y < two.y + two.height &&
        two.y < one.y + one.height
      )
        found.push(`${one.key} ${two.key}`);
  return found;
}

function columnOf(layout: Layout, key: string): number | undefined {
  return layout.boxes.find((box) => box.key === key)?.column;
}

const SEEDED = [
  ['unicon/classic@v3', CLASSIC],
  ['a program of several files', FOLDER],
] as const;

describe('the layout', () => {
  it.each(SEEDED)(
    'draws %s the same every time, with no wire behind a box',
    (_, text) => {
      const first = laid(text);

      expect(laid(text)).toEqual(first);
      expect(behind(first)).toEqual([]);
      expect(overlaps(first)).toEqual([]);
      expect(first.wires.length).toBeGreaterThan(0);
    },
  );

  it('gives every port a row of its own, a step’s outputs under its inputs', () => {
    const layout = laid(CLASSIC);
    const run = layout.boxes.find((box) => box.key === 'step:1');
    if (run === undefined) throw new Error('run is not drawn');
    const into = (port: string) =>
      layout.wires.find((wire) => wire.to.box === run.key && wire.to.port === port);
    const out = (port: string) =>
      layout.wires.find((wire) => wire.from.box === run.key && wire.from.port === port);
    const ys = [
      ...run.left.map((port) => into(port)?.points.at(-1)?.y),
      ...['output', 'time_ms', 'memory_kb'].map((port) => out(port)?.points[0]?.y),
    ];

    expect(run.left).toEqual([
      'program',
      'stdin',
      'args',
      'time_limit',
      'memory_limit',
    ]);
    expect(run.right).toEqual(['output', 'time_ms', 'memory_kb']);
    // args is given nothing, so it has no wire; every other row is one row down.
    const drawn = ys.filter((y): y is number => y !== undefined);
    expect(drawn).toHaveLength(7);
    expect([...drawn].sort((a, b) => a - b)).toEqual(drawn);
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(run.height).toBeGreaterThan(8 * 28);
    expect(rowOf(run, 'right', 'output')).toBe(5);
  });

  it('puts classic@v3 in columns by what each step reads', () => {
    const layout = laid(CLASSIC);

    expect(columnOf(layout, 'inputs:0')).toBe(0);
    expect(columnOf(layout, 'step:0')).toBe(1);
    expect(columnOf(layout, 'inputs:1')).toBe(1);
    expect(columnOf(layout, 'step:1')).toBe(2);
    expect(columnOf(layout, 'inputs:2')).toBe(2);
    expect(columnOf(layout, 'step:2')).toBe(3);
    expect(columnOf(layout, 'outputs')).toBe(4);
    const reads = layout.boxes.find((box) => box.key === 'inputs:0');
    expect(reads?.right).toEqual(['submission', 'language']);
    expect(reads?.readers).toEqual(['compile']);
    const limits = layout.boxes.find((box) => box.key === 'inputs:1');
    expect(limits?.right).toEqual(['input', 'time_limit', 'memory_limit']);
    expect(limits?.readers).toEqual(['run']);
  });

  it('runs the compile log to the outputs through a slot in each column it crosses', () => {
    const layout = laid(CLASSIC);

    const log = layout.slots.filter((slot) => slot.source === 'steps:0.log');
    expect(log.map((slot) => slot.column)).toEqual([2, 3]);
    expect(log.map((slot) => slot.label)).toEqual(['log from compile', null]);
    const wire = layout.wires.find((found) => found.target === 'outputs:log');
    expect(wire?.points).toHaveLength(2 + 2 * 2);
  });

  it('gives a wire skipping two columns a slot in each', () => {
    const layout = laid(`
inputs:
  n: number
steps:
  - {id: a, use: unicon/exec@v1, with: {time_limit: "\${{ inputs.n }}"}}
  - {id: b, use: unicon/exec@v1, with: {program: "\${{ steps.a.output }}"}}
  - {id: c, use: unicon/exec@v1, with: {program: "\${{ steps.b.output }}"}}
  - {id: d, use: unicon/exec@v1, with: {program: "\${{ steps.c.output }}", stdin: "\${{ steps.a.output }}"}}
`);

    expect([0, 1, 2, 3].map((index) => columnOf(layout, `step:${index}`))).toEqual([
      1, 2, 3, 4,
    ]);
    const skipped = layout.slots.filter((slot) => slot.source === 'steps:0.output');
    expect(skipped.map((slot) => slot.column)).toEqual([2, 3]);
    expect(skipped[0]?.label).toBe('output from a');
    expect(behind(layout)).toEqual([]);
  });

  it('puts an input read by steps in different columns before the first, sharing its slots', () => {
    const layout = laid(`
inputs:
  limit: number
steps:
  - {id: a, use: unicon/exec@v1, with: {time_limit: "\${{ inputs.limit }}"}}
  - {id: b, use: unicon/exec@v1, with: {program: "\${{ steps.a.output }}"}}
  - id: c
    use: unicon/exec@v1
    with: {program: "\${{ steps.b.output }}", time_limit: "\${{ inputs.limit }}", memory_limit: "\${{ inputs.limit }}"}
`);

    expect(columnOf(layout, 'inputs:0,2')).toBe(0);
    const slots = layout.slots.filter((slot) => slot.source === 'inputs:limit');
    expect(slots.map((slot) => slot.column)).toEqual([1, 2]);
    expect(layout.wires.filter((wire) => wire.source === 'inputs:limit')).toHaveLength(
      3,
    );
    expect(behind(layout)).toEqual([]);
  });

  it('counts an input written into text as read, and draws no wire for it', () => {
    const layout = laid(`
inputs:
  episodes: number
  time_limit: number
  input: file
steps:
  - id: run
    use: unicon/exec@v1
    with:
      program: \${{ inputs.input }}
      stdin: \${{ inputs.input }}
      args: "--episodes \${{ inputs.episodes }}"
      time_limit: \${{ inputs.time_limit }}
      memory_limit: 256
`);

    const group = layout.boxes.find((box) => box.kind === 'inputs');
    expect(group?.right).toEqual(['input', 'episodes', 'time_limit']);
    expect(group?.column).toBe(columnOf(layout, 'step:0')! - 1);
    expect(layout.wires.some((wire) => wire.to.port === 'args')).toBe(false);
    expect(layout.wires.some((wire) => wire.to.port === 'time_limit')).toBe(true);
    expect(behind(layout)).toEqual([]);
    expect(overlaps(layout)).toEqual([]);
  });

  it('stands what nothing reads in the first column', () => {
    const layout = laid(`
inputs:
  spare: text
  input: file
steps:
  - {id: first, use: unicon/compile@v3, with: {}}
  - {id: run, use: unicon/exec@v1, with: {program: "\${{ steps.first.program }}", stdin: "\${{ inputs.input }}"}}
`);

    expect(columnOf(layout, 'inputs:')).toBe(0);
    expect(columnOf(layout, 'step:1')).toBe(2);
    expect(columnOf(layout, 'inputs:1')).toBe(1);
  });

  it('orders a column to cut the crossings its wires make', () => {
    const layout = laid(`
inputs:
  a: number
  b: number
steps:
  - {id: first, use: unicon/exec@v1, with: {time_limit: "\${{ inputs.b }}"}}
  - {id: second, use: unicon/exec@v1, with: {time_limit: "\${{ inputs.a }}"}}
  - id: last
    use: unicon/exec@v1
    with: {program: "\${{ steps.second.output }}", stdin: "\${{ steps.first.output }}"}
`);

    expect(layout.crossings).toBe(0);
    expect(behind(layout)).toEqual([]);
  });

  it('colours the columns 1 to 5 and back, and a wire by the column it leaves', () => {
    const pingpong = [0, 1, 2, 3, 4, 3, 2, 1];
    const layout = laid(CLASSIC);
    for (const box of layout.boxes) {
      expect(box.colour).toBe(pingpong[box.column % pingpong.length]);
    }
    for (const wire of layout.wires) {
      const source = layout.boxes.find((box) => box.key === wire.from.box);
      expect(wire.colour).toBe(source?.colour);
    }
  });

  it('draws a moved wire by redrawing the columns it changes', () => {
    const before = laid(CLASSIC);
    const after = laid(
      CLASSIC.replace(
        'expected: ${{ inputs.answer }}',
        'expected: ${{ steps.compile.program }}',
      ),
    );

    expect(before.boxes.some((box) => box.key === 'inputs:2')).toBe(true);
    expect(after.boxes.some((box) => box.key === 'inputs:')).toBe(true);
    expect(
      after.slots
        .filter((slot) => slot.source === 'steps:0.program')
        .map((slot) => slot.column),
    ).toEqual([2]);
    expect(behind(after)).toEqual([]);
  });
});
