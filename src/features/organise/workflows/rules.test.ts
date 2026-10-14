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
import { NumberText } from '../forms/yaml-doc';

const CHECKER: PrimitiveInfo = {
  ref: 'unicon/checker-like@v1',
  name: 'checker-like',
  title: null,
  description: null,
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
      description: null,
      outcomes: null,
    },
    note: {
      type: 'text',
      optional: true,
      options: null,
      runs: null,
      secret: false,
      description: null,
      outcomes: null,
    },
  },
  outputs: {
    fraction: {
      type: 'number',
      optional: true,
      options: null,
      runs: null,
      secret: false,
      description: null,
      outcomes: null,
    },
    outcome: {
      type: 'outcome',
      optional: false,
      options: null,
      runs: null,
      secret: false,
      description: null,
      outcomes: null,
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
    [
      'the wrong type',
      0,
      'source',
      input('limit'),
      'This takes a folder, not a number.',
    ],
    [
      'a boolean into a file port',
      1,
      'binary',
      input('flag'),
      'This takes a file, not true or false.',
    ],
    [
      'an enum outside the port’s options',
      0,
      'language',
      input('wide'),
      'This takes one of c, cpp, java, python, not rust.',
    ],
    [
      'a once step reading a per-test step',
      3,
      'entry',
      output('check', 'fraction'),
      'The step check runs for each test, so a step that runs once cannot read it.',
    ],
    [
      'a test field into a once step',
      0,
      'source',
      field('input'),
      "Only a step that runs for each test can read a test's fields.",
    ],
    [
      'a per-test input into a once step',
      0,
      'source',
      input('answers'),
      'answers is given once for each test, so only a step that runs for each test can read it.',
    ],
    [
      'a contestant input into a port that raises a limit',
      1,
      'time_limit',
      input('guess'),
      'This value raises a limit, so the task must give it, not the entrant.',
    ],
    [
      'a step reading its own output',
      1,
      'memory_limit',
      output('run', 'time_ms'),
      'There is no step called run before this one.',
    ],
    [
      'a number into an enum port',
      2,
      'mode',
      output('run', 'time_ms'),
      'This takes one of exact, tokens.',
    ],
    [
      'an optional input into a required port',
      1,
      'input',
      input('key'),
      'That input is optional, so it can be given only to an optional port.',
    ],
    [
      'a loop',
      0,
      'source',
      output('run', 'output'),
      'That would make a loop: run already reads this step.',
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
    ).toBe('This value raises a limit, so it must be known when the task is saved.');
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
    ).toBe('This value raises a limit, so it must be known when the task is saved.');
    expect(
      wireRefusal(workflow, primitives, 1, 'args', output('check', 'fraction')),
    ).toBeNull();
    expect(
      wireRefusal(workflow, primitives, 1, 'input', output('check', 'fraction')),
    ).toBe('That output may be missing, so it can be given only to an optional port.');
  });

  it('lets a step read one listed after it when that makes no loop', () => {
    expect(
      wireRefusal(WORKFLOW, primitives, 0, 'source', output('late', 'binary')),
    ).toBeNull();
  });

  it('reports only text and numbers', () => {
    expect(reportRefusal(WORKFLOW, primitives, output('run', 'time_ms'))).toBeNull();
    expect(reportRefusal(WORKFLOW, primitives, output('run', 'output'))).toBe(
      'steps.run.output is a file, and only text or a number can be reported.',
    );
    expect(reportRefusal(WORKFLOW, primitives, input('limit'))).toBe(
      "Only a step's output can be reported, not an input or a test's field.",
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
    ).toBe('This value raises a limit, so it must be known when the task is saved.');
    expect(
      valueRefusal(WORKFLOW, primitives, 0, 'language', '${{ inputs.limit }}s', [
        input('limit'),
      ]),
    ).toBe('This takes one of c, cpp, java, python.');
    expect(
      valueRefusal(WORKFLOW, primitives, 0, 'entry', 'x ${{ test.episodes }}', [
        field('episodes'),
      ]),
    ).toBe("Only a step that runs for each test can read a test's fields.");
    expect(
      valueRefusal(WORKFLOW, primitives, 1, 'args', 'x ${{ inputs.key }}', [
        input('key'),
      ]),
    ).toBe(
      '${{ inputs.key }} is optional, so it can be given only whole, to an optional port, not written into text.',
    );
    expect(valueRefusal(WORKFLOW, primitives, 0, 'language', 'rust', [])).toBe(
      'This takes one of c, cpp, java, python.',
    );
    expect(valueRefusal(WORKFLOW, primitives, 1, 'binary', true, [])).toBe(
      'This takes a file, not true or false.',
    );
    expect(
      valueRefusal(WORKFLOW, primitives, 1, 'binary', 'x ${{ steps.run.output }}', [
        output('run', 'output'),
      ]),
    ).toBe("A step's output can be given only whole, not written into text.");
    expect(
      valueRefusal(WORKFLOW, primitives, 1, 'time_limit', new NumberText('2'), []),
    ).toBeNull();
  });

  it('refuses switching a step while a wire forbids it', () => {
    const workflow = readWorkflow(parse(CLASSIC_V2));

    expect(switchRefusal(workflow, 1)).toBe(
      "It reads the test's input, which only a step that runs for each test can read.",
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
    expect(switchRefusal(once, 0)).toBe(
      'b runs once and reads it, so this step runs once too.',
    );
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
    ).toBe('better, at_least and at_most apply only to a number, and this is text.');
    expect(
      reportRefusal(workflow, primitives, output('run', 'memory_kb'), time),
    ).toBeNull();
  });

  it('refuses running a step once while the report ranks its output', () => {
    const workflow = readWorkflow(
      parse(`
test: {input: file}
steps:
  - {id: run, use: unicon/sandbox-run@v2, per_test: true, with: {}}
report:
  time: {from: "\${{ steps.run.time_ms }}", better: lower}
`),
    );

    expect(switchRefusal(workflow, 0)).toBe(
      'The report says which way time is better, so this step runs for each test.',
    );
  });

  it('refuses a better that is not a task enum of higher and lower, and bounds the wrong way', () => {
    const workflow = readWorkflow(
      parse(`
inputs:
  dir: {type: enum, options: [higher, lower], contestant: true}
test: {input: file}
steps:
  - {id: run, use: unicon/sandbox-run@v2, per_test: true, with: {}}
report:
  score: {from: "\${{ steps.run.time_ms }}", better: "\${{ inputs.dir }}"}
  bounded: {from: "\${{ steps.run.time_ms }}", at_least: 5, at_most: 1}
`),
    );
    const [score, bounded] = workflow.report;

    expect(
      reportRefusal(workflow, primitives, output('run', 'time_ms'), score ?? null),
    ).toBe('dir must be an enum input that the task gives, not the entrant.');
    expect(
      reportRefusal(workflow, primitives, output('run', 'time_ms'), bounded ?? null),
    ).toBe('The upper bound must be at least the lower bound.');
    const close = bounded && {
      ...bounded,
      atLeast: new NumberText('1.00000000000000000002'),
      atMost: new NumberText('1.00000000000000000001'),
    };
    expect(
      reportRefusal(workflow, primitives, output('run', 'time_ms'), close ?? null),
    ).toBe('The upper bound must be at least the lower bound.');
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
      'run.time_limit: This value raises a limit, so the task must give it, not the entrant.',
    );
  });
});
