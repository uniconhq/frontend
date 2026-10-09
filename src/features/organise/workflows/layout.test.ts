import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CLASSIC_FOLDER, CLASSIC_V1, CLASSIC_V2, PRIMITIVES } from '@/test/workflows';
import { colourOf, layoutWorkflow, type Box, type Layout, type Point } from './layout';
import { readWorkflow } from './model';
import { byRef } from './primitives';

const primitives = byRef(PRIMITIVES);

function laid(text: string): Layout {
  return layoutWorkflow(readWorkflow(parse(text)), primitives);
}

/** Points along a wire as it is drawn: each level run and each curve between columns. */
function along(points: Point[]): Point[] {
  const found: Point[] = [];
  for (let at = 0; at + 1 < points.length; at += 1) {
    const a = points[at];
    const b = points[at + 1];
    if (a === undefined || b === undefined) continue;
    const middle = (a.x + b.x) / 2;
    for (let step = 0; step <= 40; step += 1) {
      const t = step / 40;
      if (a.y === b.y) {
        found.push({ x: a.x + (b.x - a.x) * t, y: a.y });
        continue;
      }
      const u = 1 - t;
      found.push({
        x:
          u * u * u * a.x +
          3 * u * u * t * middle +
          3 * u * t * t * middle +
          t * t * t * b.x,
        y:
          u * u * u * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * b.y,
      });
    }
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
  ['unicon/classic@v1', CLASSIC_V1],
  ['unicon/classic@v2', CLASSIC_V2],
  ['unicon/classic-folder@v1', CLASSIC_FOLDER],
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

  it('puts classic@v2 in columns by what each step reads', () => {
    const layout = laid(CLASSIC_V2);

    expect(columnOf(layout, 'inputs:0')).toBe(0);
    expect(columnOf(layout, 'step:0')).toBe(1);
    expect(layout.band).toEqual({ first: 2, last: 4 });
    expect(columnOf(layout, 'test:1')).toBe(2);
    expect(columnOf(layout, 'inputs:1')).toBe(2);
    expect(columnOf(layout, 'step:1')).toBe(3);
    expect(columnOf(layout, 'test:2')).toBe(3);
    expect(columnOf(layout, 'step:2')).toBe(4);
    expect(columnOf(layout, 'report')).toBe(5);
    const reads = layout.boxes.find((box) => box.key === 'inputs:0');
    expect(reads?.right).toEqual(['submission', 'language']);
    expect(reads?.readers).toEqual(['compile']);
  });

  it('runs the compile log to the report through a slot in each column it crosses', () => {
    const layout = laid(CLASSIC_V2);

    const log = layout.slots.filter((slot) => slot.source === 'steps:0.compile_log');
    expect(log.map((slot) => slot.column)).toEqual([2, 3, 4]);
    expect(log.map((slot) => slot.label)).toEqual(['compile.compile_log', null, null]);
    const wire = layout.wires.find((found) => found.target === 'report:log');
    expect(wire?.points).toHaveLength(2 + 2 * 3);
  });

  it('gives a wire skipping two columns a slot in each', () => {
    const layout = laid(`
inputs:
  n: number
test:
  input: file
steps:
  - {id: a, use: unicon/sandbox-run@v2, with: {time_limit: "\${{ inputs.n }}"}}
  - {id: b, use: unicon/sandbox-run@v2, with: {binary: "\${{ steps.a.output }}"}}
  - {id: c, use: unicon/sandbox-run@v2, with: {binary: "\${{ steps.b.output }}"}}
  - {id: d, use: unicon/sandbox-run@v2, with: {binary: "\${{ steps.c.output }}", input: "\${{ steps.a.output }}"}}
`);

    expect([0, 1, 2, 3].map((index) => columnOf(layout, `step:${index}`))).toEqual([
      1, 2, 3, 4,
    ]);
    const skipped = layout.slots.filter((slot) => slot.source === 'steps:0.output');
    expect(skipped.map((slot) => slot.column)).toEqual([2, 3]);
    expect(skipped[0]?.label).toBe('a.output');
    expect(behind(layout)).toEqual([]);
  });

  it('puts an input read by steps in different columns before the first, sharing its slots', () => {
    const layout = laid(`
inputs:
  limit: number
test:
  input: file
steps:
  - {id: a, use: unicon/sandbox-run@v2, with: {time_limit: "\${{ inputs.limit }}"}}
  - {id: b, use: unicon/sandbox-run@v2, with: {binary: "\${{ steps.a.output }}"}}
  - id: c
    use: unicon/sandbox-run@v2
    with: {binary: "\${{ steps.b.output }}", time_limit: "\${{ inputs.limit }}", memory_limit: "\${{ inputs.limit }}"}
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
test:
  input: file
steps:
  - id: run
    use: unicon/sandbox-run@v2
    per_test: true
    with:
      binary: \${{ test.input }}
      input: \${{ test.input }}
      args: "--episodes \${{ inputs.episodes }}"
      time_limit: \${{ inputs.time_limit }}
      memory_limit: 256
`);

    const group = layout.boxes.find((box) => box.kind === 'inputs');
    expect(group?.right).toEqual(['episodes', 'time_limit']);
    expect(group?.column).toBe(columnOf(layout, 'step:0')! - 1);
    expect(layout.wires.some((wire) => wire.to.port === 'args')).toBe(false);
    expect(layout.wires.some((wire) => wire.to.port === 'time_limit')).toBe(true);
  });

  it('stands what nothing reads in the first column, and test fields in the band', () => {
    const layout = laid(`
inputs:
  spare: text
test:
  input: file
  unused: number
steps:
  - {id: run, use: unicon/sandbox-run@v2, per_test: true, with: {input: "\${{ test.input }}"}}
`);

    expect(columnOf(layout, 'inputs:')).toBe(0);
    expect(columnOf(layout, 'test:')).toBe(layout.band?.first);
    expect(columnOf(layout, 'test:0')).toBe(layout.band?.first);
  });

  it('orders a column to cut the crossings its wires make', () => {
    const layout = laid(`
inputs:
  a: number
  b: number
test:
  input: file
steps:
  - {id: first, use: unicon/sandbox-run@v2, with: {time_limit: "\${{ inputs.b }}"}}
  - {id: second, use: unicon/sandbox-run@v2, with: {time_limit: "\${{ inputs.a }}"}}
  - id: last
    use: unicon/sandbox-run@v2
    with: {binary: "\${{ steps.second.output }}", input: "\${{ steps.first.output }}"}
`);

    expect(layout.crossings).toBe(0);
    expect(behind(layout)).toEqual([]);
  });

  it('colours the columns 1 to 5 and back, and a wire by the column it leaves', () => {
    expect(Array.from({ length: 12 }, (_, column) => colourOf(column))).toEqual([
      0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3,
    ]);
    const layout = laid(CLASSIC_V2);
    for (const wire of layout.wires) {
      const source = layout.boxes.find((box) => box.key === wire.from.box);
      expect(wire.colour).toBe(colourOf(source?.column ?? -1));
    }
  });

  it('draws a moved wire by redrawing the columns it changes', () => {
    const before = laid(CLASSIC_V2);
    const after = laid(
      CLASSIC_V2.replace(
        'expected: ${{ test.answer }}',
        'expected: ${{ steps.compile.binary }}',
      ),
    );

    expect(before.boxes.some((box) => box.key === 'test:2')).toBe(true);
    expect(after.boxes.some((box) => box.key === 'test:')).toBe(true);
    expect(
      after.slots
        .filter((slot) => slot.source === 'steps:0.binary')
        .map((slot) => slot.column),
    ).toEqual([2, 3]);
    expect(behind(after)).toEqual([]);
  });
});
