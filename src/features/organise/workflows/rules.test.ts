import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CLASSIC_V2, PRIMITIVES } from '@/test/workflows';
import { readWorkflow, type Ref } from './model';
import { byRef, type PrimitiveInfo } from './primitives';
import {
  mayBeOptional,
  newProblem,
  orderAfterWire,
  reportRefusal,
  switchRefusal,
  valueRefusal,
  wireRefusal,
} from './rules';

const CHECKER: PrimitiveInfo = {
  ref: 'unicon/checker-like@v1',
  name: 'checker-like',
  version: 'v1',
  batch: true,
  network: false,
  limits: {},
  limits_from: {},
  inputs: {
    mode: {
      type: 'enum',
      options: ['exact', 'tokens'],
      optional: false,
      runs: null,
      secret: false,
    },
    note: { type: 'text', optional: true, options: null, runs: null, secret: false },
  },
  outputs: {
    fraction: {
      type: 'number',
      optional: true,
      options: null,
      runs: null,
      secret: false,
    },
    outcome: {
      type: 'outcome',
      optional: false,
      options: null,
      runs: null,
      secret: false,
    },
  },
  problem: null,
};

const primitives = byRef([...PRIMITIVES, CHECKER]);

const WORKFLOW = readWorkflow(
  parse(`
inputs:
  submission: {type: file, contestant: true}
  language: {type: enum, options: [c, cpp], contestant: true}
  wide: {type: enum, options: [c, rust], contestant: true}
  mode: {type: enum, options: [exact]}
  answers: {type: file, contestant: true, per_test: true}
  limit: number
  guess: {type: number, contestant: true}
  key: {type: text, optional: true}
  flag: boolean
test:
  input: file
  episodes: number
steps:
  - {id: compile, use: unicon/compile@v2, with: {}}
  - {id: run, use: unicon/sandbox-run@v2, per_test: true, with: {binary: "\${{ steps.compile.binary }}"}}
  - {id: check, use: unicon/checker-like@v1, per_test: true, with: {}}
  - {id: late, use: unicon/compile@v2, with: {}}
`),
);

const input = (name: string): Ref => ({ kind: 'inputs', name });
const field = (name: string): Ref => ({ kind: 'test', name });
const output = (name: string, out: string): Ref => ({
  kind: 'steps',
  name,
  output: out,
});

describe('the drag rules', () => {
  it.each([
    ['a file into a folder port', 0, 'source', input('submission')],
    ['an enum within the port’s options', 0, 'language', input('language')],
    ['a number into a text port', 1, 'args', input('limit')],
    ['a boolean into a text port', 1, 'args', input('flag')],
    ['a test field into a per-test step', 1, 'input', field('input')],
    ['a per-test input into a per-test step', 1, 'input', input('answers')],
    ['an optional input into an optional port', 1, 'args', input('key')],
    ['a task input into a port that raises a limit', 1, 'time_limit', input('limit')],
    [
      'a test field into a port that raises a limit',
      1,
      'time_limit',
      field('episodes'),
    ],
    ['an enum within an enum port', 2, 'mode', input('mode')],
  ] as const)('lets %s be wired', (_, step, port, source) => {
    expect(wireRefusal(WORKFLOW, primitives, step, port, source)).toBeNull();
  });

  it.each([
    ['the wrong type', 0, 'source', input('limit'), 'Takes folder, not number.'],
    [
      'a boolean into a file port',
      1,
      'binary',
      input('flag'),
      'Takes file, not boolean.',
    ],
    [
      'an enum outside the port’s options',
      0,
      'language',
      input('wide'),
      'Takes one of c, cpp, java, python, not rust.',
    ],
    [
      'a once step reading a per-test step',
      3,
      'entry',
      output('check', 'fraction'),
      'The step check runs per test, and a step that runs once cannot read it.',
    ],
    [
      'a test field into a once step',
      0,
      'source',
      field('input'),
      'test.<field> is there only in a step that runs per test.',
    ],
    [
      'a per-test input into a once step',
      0,
      'source',
      input('answers'),
      'answers is given once per test, so only a per-test step reads it.',
    ],
    [
      'a contestant input into a port that raises a limit',
      1,
      'time_limit',
      input('guess'),
      'This port raises a limit, so the task must give it, not the contestant.',
    ],
    [
      'a step reading its own output',
      1,
      'memory_limit',
      output('run', 'time_ms'),
      'A step cannot read its own output.',
    ],
    [
      'a number into an enum port',
      2,
      'mode',
      output('run', 'time_ms'),
      'Takes one of exact, tokens.',
    ],
    [
      'an optional input into a required port',
      1,
      'input',
      input('key'),
      'The input is optional, so it feeds only an optional port.',
    ],
    [
      'a loop',
      0,
      'source',
      output('run', 'output'),
      'That makes a loop: run reads this step already.',
    ],
  ] as const)('refuses %s with its reason', (_, step, port, source, reason) => {
    expect(wireRefusal(WORKFLOW, primitives, step, port, source)).toBe(reason);
  });

  it('refuses a step output into a port that raises a limit', () => {
    const workflow = readWorkflow(
      parse(`
inputs: {}
test: {input: file}
steps:
  - {id: first, use: unicon/sandbox-run@v2, with: {}}
  - {id: second, use: unicon/sandbox-run@v2, with: {}}
`),
    );

    expect(
      wireRefusal(workflow, primitives, 1, 'time_limit', output('first', 'time_ms')),
    ).toBe('This port raises a limit, so it must be known at the save.');
  });

  it('refuses an optional output into a required port', () => {
    const workflow = readWorkflow(
      parse(`
test: {input: file}
steps:
  - {id: check, use: unicon/checker-like@v1, per_test: true, with: {}}
  - {id: run, use: unicon/sandbox-run@v2, per_test: true, with: {}}
`),
    );

    expect(
      wireRefusal(workflow, primitives, 1, 'time_limit', output('check', 'fraction')),
    ).toBe('This port raises a limit, so it must be known at the save.');
    expect(
      wireRefusal(workflow, primitives, 1, 'args', output('check', 'fraction')),
    ).toBeNull();
    expect(
      wireRefusal(workflow, primitives, 1, 'input', output('check', 'fraction')),
    ).toBe('The output may be absent, so it feeds only an optional port.');
  });

  it('lets a step read one listed after it when that makes no loop', () => {
    expect(
      wireRefusal(WORKFLOW, primitives, 0, 'source', output('late', 'binary')),
    ).toBeNull();
  });

  it('reports only text and numbers', () => {
    expect(reportRefusal(WORKFLOW, primitives, output('run', 'time_ms'))).toBeNull();
    expect(reportRefusal(WORKFLOW, primitives, output('run', 'output'))).toBe(
      'steps.run.output is file; a report holds text or numbers.',
    );
  });

  it('takes text with values written in only into a text port', () => {
    expect(
      valueRefusal(WORKFLOW, primitives, 1, 'args', '--n ${{ test.episodes }}', [
        field('episodes'),
      ]),
    ).toBeNull();
    expect(
      valueRefusal(WORKFLOW, primitives, 1, 'time_limit', '${{ inputs.limit }}s', [
        input('limit'),
      ]),
    ).toBe('Text with values written in fits only a text port.');
    expect(
      valueRefusal(WORKFLOW, primitives, 0, 'entry', 'x ${{ test.episodes }}', [
        field('episodes'),
      ]),
    ).toBe('test.<field> is there only in a step that runs per test.');
    expect(
      valueRefusal(WORKFLOW, primitives, 1, 'args', 'x ${{ inputs.key }}', [
        input('key'),
      ]),
    ).toBe(
      'inputs.key is optional, so it is given whole to optional ports, never written into text.',
    );
    expect(valueRefusal(WORKFLOW, primitives, 0, 'language', 'rust', [])).toBe(
      'Takes one of c, cpp, java, python.',
    );
    expect(valueRefusal(WORKFLOW, primitives, 1, 'time_limit', 2, [])).toBeNull();
  });

  it('refuses switching a step while a wire forbids it', () => {
    const workflow = readWorkflow(parse(CLASSIC_V2));

    expect(switchRefusal(workflow, 1)).toBe(
      'It reads test.input, which only a per-test step reads.',
    );
    expect(switchRefusal(workflow, 0)).toBeNull();
    const once = readWorkflow(
      parse(`
test: {input: file}
steps:
  - {id: a, use: unicon/compile@v2}
  - {id: b, use: unicon/compile@v2, with: {source: "\${{ steps.a.binary }}"}}
`),
    );
    expect(switchRefusal(once, 0)).toBe('b runs once and reads it.');
  });

  it('moves the fewest steps when a step comes to read a later one', () => {
    const workflow = readWorkflow(
      parse(`
test: {input: file}
steps:
  - {id: a, use: unicon/compile@v2}
  - {id: b, use: unicon/compile@v2, with: {source: "\${{ steps.a.binary }}"}}
  - {id: c, use: unicon/compile@v2, with: {source: "\${{ steps.b.binary }}"}}
  - {id: d, use: unicon/compile@v2}
`),
    );

    expect(orderAfterWire(workflow, 0, 3)).toEqual([3, 0, 1, 2]);
    expect(orderAfterWire(workflow, 2, 3)).toEqual([0, 1, 3, 2]);
  });

  it('offers optional only on a task input every use of which is an optional port, whole', () => {
    const workflow = readWorkflow(
      parse(`
inputs:
  key: text
  other: text
test: {input: file}
steps:
  - {id: run, use: unicon/sandbox-run@v2, per_test: true, with: {args: "\${{ inputs.key }}", input: "\${{ inputs.other }}"}}
`),
    );

    expect(mayBeOptional(workflow, primitives, 'key')).toBe(true);
    expect(mayBeOptional(workflow, primitives, 'other')).toBe(false);
  });

  it('refuses an output dropped on an entry whose meaning it cannot have', () => {
    const workflow = readWorkflow(parse(CLASSIC_V2));
    const time = workflow.report.find((entry) => entry.name === 'time_ms') ?? null;

    expect(
      reportRefusal(workflow, primitives, output('compile', 'compile_log'), time),
    ).toBe('fold, better, at_least and at_most say what a number means; this is text.');
    expect(
      reportRefusal(workflow, primitives, output('run', 'memory_kb'), time),
    ).toBeNull();
  });

  it('refuses running a step once while the report folds its output', () => {
    const workflow = readWorkflow(
      parse(`
test: {input: file}
steps:
  - {id: run, use: unicon/sandbox-run@v2, per_test: true, with: {}}
report:
  time: {from: "\${{ steps.run.time_ms }}", fold: max}
`),
    );

    expect(switchRefusal(workflow, 0)).toBe(
      "The report's time folds it over tests, so it runs per test.",
    );
  });

  it('names what a change of a declaration newly breaks', () => {
    const before = readWorkflow(parse(CLASSIC_V2));
    const after = readWorkflow(
      parse(
        CLASSIC_V2.replace(
          'time_limit: number',
          'time_limit: {type: number, contestant: true}',
        ),
      ),
    );

    expect(newProblem(before, before, primitives)).toBeNull();
    expect(newProblem(before, after, primitives)).toBe(
      'run.time_limit: This port raises a limit, so the task must give it, not the contestant.',
    );
  });
});
