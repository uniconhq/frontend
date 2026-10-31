import { describe, expect, it } from 'vitest';
import { parseYaml } from '../forms/yaml-doc';
import { CLASSIC, CLASSIC_V4, FOLDER, PRIMITIVES } from '@/test/workflows';
import {
  BOX,
  GEOMETRY,
  PALETTE,
  layoutWorkflow,
  rowOf,
  wirePath,
  type Box,
  type Drawn,
  type Layout,
  type Point,
} from './layout';
import { readWorkflow } from './model';
import { byRef } from './primitives';

const primitives = byRef(PRIMITIVES);

/** The layout of a file read as the editor reads it, YAML 1.1. */
function laid(text: string, drawn?: Drawn): Layout {
  const parsed = parseYaml(text);
  if ('error' in parsed) throw new Error(parsed.error);
  return layoutWorkflow(readWorkflow(parsed.doc.toJS()), primitives, new Map(), {
    open: 'all',
    ...drawn,
  });
}

function boxAt(layout: Layout, key: string): Box {
  const found = layout.boxes.find((box) => box.key === key);
  if (found === undefined) throw new Error(`${key} is not drawn`);
  return found;
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
  ['unicon/classic@v4', CLASSIC],
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
    const run = layout.boxes.find((box) => box.key === 'step:0');
    if (run === undefined) throw new Error('run is not drawn');
    const into = (port: string) =>
      layout.wires.find((wire) => wire.to.box === run.key && wire.to.port === port);
    const out = (port: string) =>
      layout.wires.find((wire) => wire.from.box === run.key && wire.from.port === port);
    const ys = [
      ...run.left.map((port) => into(port)?.points.at(-1)?.y),
      ...['output', 'time_ms', 'memory_kb', 'log'].map(
        (port) => out(port)?.points[0]?.y,
      ),
    ];

    expect(run.left).toEqual([
      'source',
      'language',
      'entry',
      'stdin',
      'files',
      'loads',
      'manifest',
      'self_reported',
      'args',
      'time_limit',
      'memory_limit',
    ]);
    expect(run.right).toEqual([
      'output',
      'time_ms',
      'memory_kb',
      'label',
      'message',
      'staff_message',
      'extras',
      'log',
    ]);
    // The ports given nothing have no wire; every other row is one row down.
    const drawn = ys.filter((y): y is number => y !== undefined);
    expect(drawn).toHaveLength(9);
    expect([...drawn].sort((a, b) => a - b)).toEqual(drawn);
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(run.height).toBeGreaterThan(19 * 28);
    expect(rowOf(run, 'right', 'output')).toBe(11);
  });

  it('puts classic@v4 in columns by what each step reads, each input a box in the first', () => {
    const layout = laid(CLASSIC);

    expect(columnOf(layout, 'step:0')).toBe(1);
    expect(columnOf(layout, 'step:1')).toBe(2);
    expect(columnOf(layout, 'outputs')).toBe(3);
    const inputs = layout.boxes.filter((box) => box.kind === 'input');
    expect(inputs.map((box) => box.key).sort()).toEqual(
      ['answer', 'input', 'language', 'memory_limit', 'submission', 'time_limit']
        .map((name) => `input:${name}`)
        .sort(),
    );
    expect(inputs.every((box) => box.column === 0)).toBe(true);
    expect(boxAt(layout, 'input:submission').right).toEqual(['submission']);
    expect(boxAt(layout, 'input:submission').readers).toEqual(['run']);
    expect(boxAt(layout, 'input:time_limit').readers).toEqual(['run']);
  });

  it('draws deploy’s classic@v4: two exec steps with their ports, the run’s output fed to the diff', () => {
    const layout = laid(CLASSIC_V4);
    const solution = boxAt(layout, 'step:0');
    const compare = boxAt(layout, 'step:1');
    const wire = (from: string, to: string) =>
      layout.wires.find(
        (found) =>
          `${found.from.box}.${found.from.port}` === from &&
          `${found.to.box}.${found.to.port}` === to,
      );

    for (const step of [solution, compare]) {
      expect(step.left).toContain('source');
      expect(step.left).toContain('files');
      expect(step.right).toContain('output');
    }
    expect(columnOf(layout, 'step:1')).toBeGreaterThan(columnOf(layout, 'step:0') ?? 0);
    expect(wire('step:0.output', 'step:1.files')).toBeDefined();
    expect(wire('input:answer.answer', 'step:1.files')).toBeDefined();
    expect(wire('step:0.log', 'outputs.log')).toBeDefined();
    expect(wire('file:diff/.diff/', 'step:1.source')).toBeDefined();
  });

  it('runs the compile log to the outputs through a slot in each column it crosses', () => {
    const layout = laid(CLASSIC);

    const log = layout.slots.filter((slot) => slot.source === 'steps:0.log');
    expect(log.map((slot) => slot.column)).toEqual([2]);
    expect(log.map((slot) => slot.label)).toEqual(['log from run']);
    const wire = layout.wires.find((found) => found.target === 'outputs:log');
    expect(wire?.points).toHaveLength(2 + 2 * 1);
  });

  it('gives a wire skipping two columns a slot in each', () => {
    const layout = laid(`
inputs:
  n: number
steps:
  - {id: a, use: unicon/exec@v2, with: {time_limit: "\${{ inputs.n }}"}}
  - {id: b, use: unicon/exec@v2, with: {source: "\${{ steps.a.output }}"}}
  - {id: c, use: unicon/exec@v2, with: {source: "\${{ steps.b.output }}"}}
  - {id: d, use: unicon/exec@v2, with: {source: "\${{ steps.c.output }}", stdin: "\${{ steps.a.output }}"}}
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
  - {id: a, use: unicon/exec@v2, with: {time_limit: "\${{ inputs.limit }}"}}
  - {id: b, use: unicon/exec@v2, with: {source: "\${{ steps.a.output }}"}}
  - id: c
    use: unicon/exec@v2
    with: {source: "\${{ steps.b.output }}", time_limit: "\${{ inputs.limit }}", memory_limit: "\${{ inputs.limit }}"}
`);

    expect(columnOf(layout, 'input:limit')).toBe(0);
    expect(boxAt(layout, 'input:limit').readers).toEqual(['a', 'c']);
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
    use: unicon/exec@v2
    with:
      source: \${{ inputs.input }}
      stdin: \${{ inputs.input }}
      args: "--episodes \${{ inputs.episodes }}"
      time_limit: \${{ inputs.time_limit }}
      memory_limit: 256
`);

    expect(boxAt(layout, 'input:episodes').readers).toEqual(['run']);
    expect(boxAt(layout, 'input:time_limit').readers).toEqual(['run']);
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
  - {id: first, use: unicon/exec@v2, with: {}}
  - {id: run, use: unicon/exec@v2, with: {source: "\${{ steps.first.output }}", stdin: "\${{ inputs.input }}"}}
`);

    expect(columnOf(layout, 'input:spare')).toBe(0);
    expect(boxAt(layout, 'input:spare').readers).toEqual([]);
    expect(columnOf(layout, 'input:input')).toBe(0);
    expect(columnOf(layout, 'step:1')).toBe(2);
    // What nothing reads stands under what is read, in the order of `inputs:`.
    expect(boxAt(layout, 'input:spare').y).toBeGreaterThan(
      boxAt(layout, 'input:input').y,
    );
  });

  it('orders a column to cut the crossings its wires make', () => {
    const layout = laid(`
inputs:
  a: number
  b: number
steps:
  - {id: first, use: unicon/exec@v2, with: {time_limit: "\${{ inputs.b }}"}}
  - {id: second, use: unicon/exec@v2, with: {time_limit: "\${{ inputs.a }}"}}
  - id: last
    use: unicon/exec@v2
    with: {source: "\${{ steps.second.output }}", stdin: "\${{ steps.first.output }}"}
`);

    expect(layout.crossings).toBe(0);
    expect(behind(layout)).toEqual([]);
  });

  it('colours the inputs, the outputs and the steps by column, and a wire by the box it leaves', () => {
    const layout = laid(`
inputs:
  n: number
steps:
  - {id: a, use: unicon/exec@v2, with: {time_limit: "\${{ inputs.n }}"}}
  - {id: b, use: unicon/exec@v2, with: {source: "\${{ steps.a.output }}"}}
  - {id: c, use: unicon/exec@v2, with: {source: "\${{ steps.b.output }}"}}
  - {id: d, use: unicon/exec@v2, with: {source: "\${{ steps.c.output }}"}}
  - {id: e, use: unicon/exec@v2, with: {source: "\${{ steps.d.output }}"}}
outputs:
  out: {from: "\${{ steps.e.output }}"}
`);
    const [pink, rose, peach] = PALETTE.middle;

    expect(boxAt(layout, 'input:n').colour).toBe(PALETTE.input);
    expect(boxAt(layout, 'outputs').colour).toBe(PALETTE.output);
    expect(
      [0, 1, 2, 3, 4].map((index) => boxAt(layout, `step:${index}`).colour),
    ).toEqual([pink, rose, peach, rose, pink]);
    for (const wire of layout.wires)
      expect(wire.colour).toBe(boxAt(layout, wire.from.box).colour);
    for (const slot of layout.slots)
      expect(slot.colour).toBe(
        layout.wires.find((wire) => wire.source === slot.source)?.colour,
      );
  });

  it('draws a moved wire by redrawing the columns it changes', () => {
    const before = laid(CLASSIC);
    const after = laid(
      CLASSIC.replace(
        'expected: ${{ inputs.answer }}',
        'expected: ${{ inputs.input }}',
      ),
    );

    expect(boxAt(before, 'input:answer').readers).toEqual(['check']);
    expect(boxAt(after, 'input:answer').readers).toEqual([]);
    expect(boxAt(after, 'input:input').readers).toEqual(['run', 'check']);
    expect(
      after.slots
        .filter((slot) => slot.source === 'inputs:input')
        .map((slot) => slot.column),
    ).toEqual([1]);
    expect(behind(after)).toEqual([]);
  });

  it('draws closed boxes as their head and a line, and an open one with a row for each port', () => {
    const closed = laid(CLASSIC, { open: new Set() });
    const open = laid(CLASSIC, { open: new Set(['step:0']) });
    const frame = BOX.stack + 2 * BOX.border;

    // run needs and gives, so its closed box has the line that says so.
    expect(boxAt(closed, 'step:0')).toMatchObject({
      open: false,
      width: BOX.closed,
      height: frame + BOX.head + BOX.line,
    });
    expect(boxAt(open, 'step:0')).toMatchObject({
      open: true,
      width: BOX.open,
      height: frame + BOX.head + 19 * GEOMETRY.row + GEOMETRY.foot,
    });
    // An input says what it is in its head alone.
    expect(boxAt(closed, 'input:answer').height).toBe(frame + BOX.head);
    // The outputs open with a row for each and one for a new one.
    const outputs = boxAt(laid(CLASSIC, { open: new Set(['outputs']) }), 'outputs');
    expect(outputs.height).toBe(
      frame + BOX.head + (outputs.left.length + 1) * GEOMETRY.row + GEOMETRY.foot,
    );
    // The column an open box stands in widens, and the ones right of it move.
    expect(boxAt(open, 'step:1').x - boxAt(closed, 'step:1').x).toBe(
      BOX.open - BOX.closed,
    );
  });

  it('gives a box a line for what is wrong, and a workflow box its foot', () => {
    const text = `
steps:
  - {id: inner, use: kenny/inner@v1, with: {}}
  - {id: run, use: unicon/exec@v2, with: {source: "\${{ steps.inner.out }}"}}
`;
    const parsed = parseYaml(text);
    if ('error' in parsed) throw new Error(parsed.error);
    const workflow = readWorkflow(parsed.doc.toJS());
    const given = new Map([['kenny/inner@v1', { inputs: ['a'], outputs: ['out'] }]]);
    const layout = layoutWorkflow(workflow, primitives, given, {
      open: new Set(),
      warned: new Set(['step:1']),
    });
    const frame = BOX.stack + 2 * BOX.border;

    expect(boxAt(layout, 'step:0')).toMatchObject({ stacked: true, warned: false });
    expect(boxAt(layout, 'step:0').height).toBe(frame + BOX.head + BOX.line + BOX.foot);
    expect(boxAt(layout, 'step:1')).toMatchObject({ stacked: false, warned: true });
    expect(boxAt(layout, 'step:1').height).toBe(frame + BOX.head + 2 * BOX.line);
  });

  it('meets a closed box on its title line and an open one at its port’s row', () => {
    const pin = BOX.stack + BOX.border + BOX.pin;
    const closed = laid(CLASSIC, { open: new Set() });
    const rowAt = (box: Box, row: number) =>
      box.y + BOX.stack + BOX.border + BOX.head + row * GEOMETRY.row + GEOMETRY.row / 2;
    for (const wire of closed.wires) {
      const from = boxAt(closed, wire.from.box);
      const to = boxAt(closed, wire.to.box);
      expect(wire.points[0]).toEqual({ x: from.x + from.width, y: from.y + pin });
      // The outputs always stand open, each wire meeting its output's row.
      expect(wire.points.at(-1)).toEqual({
        x: to.x,
        y:
          to.kind === 'outputs'
            ? rowAt(to, rowOf(to, 'left', wire.to.port))
            : to.y + pin,
      });
    }
    expect(behind(closed)).toEqual([]);
    expect(overlaps(closed)).toEqual([]);

    const open = laid(CLASSIC, { open: new Set(['step:0']) });
    const run = boxAt(open, 'step:0');
    const stdin = open.wires.find((wire) => wire.target === 'port:0.stdin');
    const output = open.wires.find((wire) => wire.from.box === 'step:0');
    expect(stdin?.points.at(-1)?.y).toBe(rowAt(run, rowOf(run, 'left', 'stdin')));
    expect(output?.points[0]?.y).toBe(
      rowAt(run, rowOf(run, 'right', output?.from.port ?? '')),
    );
    expect(behind(open)).toEqual([]);
    expect(overlaps(open)).toEqual([]);
  });

  it('draws the same picture for the same file and the same box open', () => {
    const drawn = { open: new Set(['step:1']), warned: new Set(['step:0']) };
    expect(laid(CLASSIC, drawn)).toEqual(laid(CLASSIC, drawn));
    expect(laid(CLASSIC, { open: new Set() })).not.toEqual(laid(CLASSIC, drawn));
  });

  it('still draws a draft whose steps read each other in a cycle', () => {
    const layout = laid(
      `
steps:
  - {id: a, use: unicon/exec@v2, with: {source: "\${{ steps.b.output }}"}}
  - {id: b, use: unicon/exec@v2, with: {source: "\${{ steps.a.output }}"}}
`,
      { open: new Set() },
    );

    expect(layout.boxes.filter((box) => box.kind === 'step')).toHaveLength(2);
    expect(overlaps(layout)).toEqual([]);
    expect(behind(layout)).toEqual([]);
  });

  it('colours the first step’s column first when the workflow has no inputs', () => {
    const layout = laid(`
steps:
  - {id: a, use: unicon/exec@v2, with: {}}
  - {id: b, use: unicon/exec@v2, with: {source: "\${{ steps.a.output }}"}}
`);

    expect(boxAt(layout, 'step:0').column).toBe(0);
    expect(boxAt(layout, 'step:0').colour).toBe(PALETTE.middle[0]);
    expect(boxAt(layout, 'step:1').colour).toBe(PALETTE.middle[1]);
  });

  it('runs a wire from a closed box straight to the edge of a column an open box widens', () => {
    const layout = laid(
      `
inputs:
  n: number
steps:
  - {id: a, use: unicon/exec@v2, with: {time_limit: "\${{ inputs.n }}"}}
  - {id: b, use: unicon/exec@v2, with: {memory_limit: "\${{ inputs.n }}"}}
  - {id: c, use: unicon/exec@v2, with: {source: "\${{ steps.a.output }}", stdin: "\${{ steps.b.output }}"}}
`,
      { open: new Set(['step:0']) },
    );
    const open = boxAt(layout, 'step:0');
    const closed = boxAt(layout, 'step:1');
    const wire = layout.wires.find((found) => found.from.box === 'step:1');

    expect(closed.column).toBe(open.column);
    expect(closed.width).toBe(BOX.closed);
    expect(wire?.points[0]).toEqual({
      x: closed.x + BOX.closed,
      y: closed.y + BOX.stack + BOX.border + BOX.pin,
    });
    expect(wire?.points[1]).toEqual({
      x: open.x + BOX.open,
      y: closed.y + BOX.stack + BOX.border + BOX.pin,
    });
    expect(behind(layout)).toEqual([]);
  });

  it('draws each file of the workflow a step reads as a box of its own, in the column after the inputs', () => {
    const text = `
inputs:
  code: folder
steps:
  - {id: solution, use: unicon/exec@v2, with: {source: "\${{ inputs.code }}"}}
  - id: compare
    use: unicon/exec@v2
    with:
      source: \${{ workflow.diff/ }}
      manifest: \${{ workflow.diff/program.yaml }}
      stdin: \${{ steps.solution.output }}
`;
    const layout = laid(text);
    const plain = laid(
      text
        .replaceAll('workflow.diff/program.yaml', 'inputs.code')
        .replaceAll('workflow.diff/', 'inputs.code'),
    );

    const folder = boxAt(layout, 'file:diff/');
    expect(folder).toMatchObject({
      kind: 'file',
      column: 1,
      right: ['diff/'],
      readers: ['compare'],
      colour: PALETTE.file,
    });
    expect(boxAt(layout, 'file:diff/program.yaml').readers).toEqual(['compare']);
    expect(boxAt(layout, 'input:code').column).toBe(0);
    expect(boxAt(layout, 'step:0').column).toBe(2);
    expect(boxAt(layout, 'step:1').column).toBe(3);
    // A step keeps its colour: the files' column is not one of the steps'.
    for (const index of [0, 1])
      expect(boxAt(layout, `step:${index}`).colour).toBe(
        boxAt(plain, `step:${index}`).colour,
      );
    const wire = layout.wires.find((found) => found.from.box === 'file:diff/');
    expect(wire).toMatchObject({
      source: 'workflow:diff/',
      target: 'port:1.source',
      colour: PALETTE.file,
    });
    // The file's box names it, so its wire is not labelled again.
    expect(
      layout.slots.find((slot) => slot.source === 'workflow:diff/program.yaml')?.label,
    ).toBeNull();
    expect(overlaps(layout)).toEqual([]);
    expect(behind(layout)).toEqual([]);
  });

  it('leaves the files’ column out when no step reads a file of the workflow', () => {
    const layout = laid(CLASSIC);

    expect(layout.boxes.some((box) => box.kind === 'file')).toBe(false);
    expect(boxAt(layout, 'step:0').column).toBe(1);
  });

  it('hides the inputs and files the steps read, keeping one no step reads, and each step’s colour', () => {
    const text = CLASSIC.replace(
      '${{ inputs.answer }}',
      '${{ workflow.answers/1.out }}',
    );
    const shown = laid(text);
    const layout = laid(text, { open: 'all', inputs: 'hidden' });

    expect(
      layout.boxes.filter((box) => box.kind !== 'step').map((box) => box.key),
    ).toEqual(['input:answer', 'outputs']);
    expect(layout.wires.some((wire) => wire.from.box.startsWith('input:'))).toBe(false);
    expect(boxAt(layout, 'step:0').column).toBe(1);
    // With no input drawn before them, the first steps leave room for their tabs.
    expect(boxAt(layout, 'input:answer').x).toBe(0);
    expect(boxAt(laid(CLASSIC, { open: 'all', inputs: 'hidden' }), 'step:0').x).toBe(
      BOX.tab,
    );
    for (const index of [0, 1])
      expect(boxAt(layout, `step:${index}`).colour).toBe(
        boxAt(shown, `step:${index}`).colour,
      );
    expect(overlaps(layout)).toEqual([]);
    expect(behind(layout)).toEqual([]);
  });
});
