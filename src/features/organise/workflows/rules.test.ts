import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CLASSIC, PRIMITIVES } from '@/test/workflows';
import { readWorkflow, type Ref } from './model';
import { byRef, type PrimitiveInfo } from './primitives';
import {
  mayBeOptional,
  newProblem,
  orderAfterWire,
  outputRefusal,
  outputSources,
  outputType,
  portFor,
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
  forms: {},
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
      at_least: null,
      at_most: null,
      better: null,
      inputs: null,
      names: null,
      outputs: null,
    },
    note: {
      type: 'text',
      optional: true,
      options: null,
      runs: null,
      secret: false,
      description: null,
      outcomes: null,
      at_least: null,
      at_most: null,
      better: null,
      inputs: null,
      names: null,
      outputs: null,
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
      at_least: null,
      at_most: null,
      better: null,
      inputs: null,
      names: null,
      outputs: null,
    },
    outcome: {
      type: 'outcome',
      optional: false,
      options: null,
      runs: null,
      secret: false,
      description: null,
      outcomes: null,
      at_least: null,
      at_most: null,
      better: null,
      inputs: null,
      names: null,
      outputs: null,
    },
  },
  problem: null,
};

const primitives = byRef([...PRIMITIVES, CHECKER]);

const WORKFLOW = readWorkflow(
  parse(`
inputs:
  submission: file
  language: {type: enum, options: [c, cpp]}
  wide: {type: enum, options: [c, rust]}
  mode: {type: enum, options: [exact]}
  input: file
  limit: number
  episodes: number
  key: {type: text, optional: true}
  flag: boolean
steps:
  - {id: compile, use: unicon/compile@v3, with: {}}
  - {id: run, use: unicon/exec@v1, with: {program: "\${{ steps.compile.program }}"}}
  - {id: check, use: unicon/checker-like@v1, with: {}}
  - {id: late, use: unicon/compile@v3, with: {}}
`),
);

const input = (name: string): Ref => ({ kind: 'inputs', name });
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
    ['a file input into a file port', 1, 'stdin', input('input')],
    ['an optional input into an optional port', 1, 'args', input('key')],
    ['an input into a port that raises a limit', 1, 'time_limit', input('limit')],
    [
      'another input into a port that raises a limit',
      1,
      'memory_limit',
      input('episodes'),
    ],
    [
      'a step output into a port that raises no limit',
      3,
      'entry',
      output('check', 'fraction'),
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
      'program',
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
      'stdin',
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
steps:
  - {id: first, use: unicon/exec@v1, with: {}}
  - {id: second, use: unicon/exec@v1, with: {}}
`),
    );

    expect(
      wireRefusal(workflow, primitives, 1, 'time_limit', output('first', 'time_ms')),
    ).toBe('This value raises a limit, so it must be known when the task is saved.');
  });

  it('refuses an optional output into a required port', () => {
    const workflow = readWorkflow(
      parse(`
steps:
  - {id: check, use: unicon/checker-like@v1, with: {}}
  - {id: run, use: unicon/exec@v1, with: {}}
`),
    );

    expect(
      wireRefusal(workflow, primitives, 1, 'time_limit', output('check', 'fraction')),
    ).toBe('This value raises a limit, so it must be known when the task is saved.');
    expect(
      wireRefusal(workflow, primitives, 1, 'args', output('check', 'fraction')),
    ).toBeNull();
    expect(
      wireRefusal(workflow, primitives, 1, 'stdin', output('check', 'fraction')),
    ).toBe('That output may be missing, so it can be given only to an optional port.');
  });

  it('lets a step read one listed after it when that makes no loop', () => {
    expect(
      wireRefusal(WORKFLOW, primitives, 0, 'source', output('late', 'program')),
    ).toBeNull();
  });

  it('reports only text and numbers', () => {
    expect(outputRefusal(WORKFLOW, primitives, output('run', 'time_ms'))).toBeNull();
    expect(outputRefusal(WORKFLOW, primitives, output('run', 'output'))).toBe(
      'steps.run.output is a file, and only text or a number can be reported.',
    );
    expect(outputRefusal(WORKFLOW, primitives, input('limit'))).toBe(
      "Only a step's output can be reported, not an input or a file of the workflow.",
    );
  });

  it('takes text with values written in only into a text port', () => {
    expect(
      valueRefusal(WORKFLOW, primitives, 1, 'args', '--n ${{ inputs.episodes }}', [
        input('episodes'),
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
      valueRefusal(WORKFLOW, primitives, 0, 'entry', 'x ${{ inputs.missing }}', [
        input('missing'),
      ]),
    ).toBe('The workflow has no input called missing.');
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
    expect(valueRefusal(WORKFLOW, primitives, 1, 'program', true, [])).toBe(
      'This takes a file, not true or false.',
    );
    expect(
      valueRefusal(WORKFLOW, primitives, 1, 'program', 'x ${{ steps.run.output }}', [
        output('run', 'output'),
      ]),
    ).toBe("A step's output can be given only whole, not written into text.");
    expect(
      valueRefusal(WORKFLOW, primitives, 1, 'time_limit', new NumberText('2'), []),
    ).toBeNull();
  });

  it('moves the fewest steps when a step comes to read a later one', () => {
    const workflow = readWorkflow(
      parse(`
steps:
  - {id: a, use: unicon/compile@v3}
  - {id: b, use: unicon/compile@v3, with: {source: "\${{ steps.a.program }}"}}
  - {id: c, use: unicon/compile@v3, with: {source: "\${{ steps.b.program }}"}}
  - {id: d, use: unicon/compile@v3}
`),
    );

    expect(orderAfterWire(workflow, 0, 3)).toEqual([3, 0, 1, 2]);
    expect(orderAfterWire(workflow, 2, 3)).toEqual([0, 1, 3, 2]);
  });

  it('offers optional only on an input every use of which is an optional port, whole', () => {
    const workflow = readWorkflow(
      parse(`
inputs:
  key: text
  other: text
steps:
  - {id: run, use: unicon/exec@v1, with: {args: "\${{ inputs.key }}", stdin: "\${{ inputs.other }}"}}
`),
    );

    expect(mayBeOptional(workflow, primitives, 'key')).toBe(true);
    expect(mayBeOptional(workflow, primitives, 'other')).toBe(false);
  });

  it('names a text output and a number output', () => {
    const workflow = readWorkflow(parse(CLASSIC));

    expect(outputRefusal(workflow, primitives, output('compile', 'log'))).toBeNull();
    expect(outputRefusal(workflow, primitives, output('run', 'memory_kb'))).toBeNull();
  });

  it('names what a change of a declaration newly breaks', () => {
    const before = readWorkflow(parse(CLASSIC));
    const after = readWorkflow(
      parse(CLASSIC.replace('time_limit: number', 'time_limit: text')),
    );

    expect(newProblem(before, before, primitives)).toBeNull();
    expect(newProblem(before, after, primitives)).toBe(
      'run.time_limit: This takes a number, not text.',
    );
  });
});

describe('workflow-owned sources', () => {
  it('requires the exact file or folder type', () => {
    expect(
      wireRefusal(WORKFLOW, primitives, 0, 'source', {
        kind: 'workflow',
        name: 'checker/',
      }),
    ).toBeNull();
    expect(
      wireRefusal(WORKFLOW, primitives, 0, 'source', {
        kind: 'workflow',
        name: 'checker/program.yaml',
      }),
    ).toBe('This takes a folder, not a file.');
    expect(
      wireRefusal(WORKFLOW, primitives, 1, 'stdin', {
        kind: 'workflow',
        name: 'checker/program.yaml',
      }),
    ).toBeNull();
    expect(
      wireRefusal(WORKFLOW, primitives, 1, 'stdin', {
        kind: 'workflow',
        name: 'checker/',
      }),
    ).toBe('This takes a file, not a folder.');
  });

  it('never reports a workflow file as an output', () => {
    expect(
      outputRefusal(WORKFLOW, primitives, {
        kind: 'workflow',
        name: 'checker/program.yaml',
      }),
    ).toBe(
      "Only a step's output can be reported, not an input or a file of the workflow.",
    );
  });
});

describe('a wire dropped on a box', () => {
  it('goes to the input named as its source, given or not', () => {
    expect(portFor(WORKFLOW, primitives, 1, output('compile', 'program'))).toEqual({
      port: 'program',
    });
  });

  it('else goes to the first input given nothing, leaving the refusal to the drag rules', () => {
    expect(portFor(WORKFLOW, primitives, 1, input('limit'))).toEqual({ port: 'stdin' });
    expect(wireRefusal(WORKFLOW, primitives, 1, 'stdin', input('limit'))).toBe(
      'This takes a file, not a number.',
    );
  });

  it('picks from a run workflow’s inputs as its box declares them', () => {
    const boxed = readWorkflow(
      parse('steps:\n  - {id: build, use: kenny/inner@v1, with: {}}\n'),
    );
    const boxes = new Map([
      [
        'kenny/inner@v1',
        {
          run: true,
          newer: null,
          inputs: [{ name: 'source', type: 'folder', optional: false, options: null }],
          outputs: [],
        },
      ],
    ]);
    expect(portFor(boxed, primitives, 0, input('submission'), boxes)).toEqual({
      port: 'source',
    });
  });

  it('says why when every input is given something, or the step is unknown', () => {
    const full = readWorkflow(parse(CLASSIC));
    expect(portFor(full, primitives, 2, input('submission'))).toEqual({
      reason:
        'Every input of check is given something already. Open it to choose which to change.',
    });
    const unknown = readWorkflow(
      parse('steps:\n  - {id: x, use: kenny/nothing@v1, with: {}}\n'),
    );
    expect(portFor(unknown, primitives, 0, input('submission'))).toEqual({
      reason:
        'kenny/nothing@v1 is not a primitive Unicon knows. Check its owner, name and version.',
    });
  });
});

describe('a run workflow as a step', () => {
  const boxed = readWorkflow(
    parse('steps:\n  - {id: build, use: kenny/inner@v1, with: {level: high}}\n'),
  );
  const box = (level: string[]) => ({
    run: true,
    newer: null,
    inputs: [{ name: 'level', type: 'enum', optional: false, options: level }],
    outputs: [
      { name: 'program', type: 'file' },
      { name: 'took_ms', type: 'number' },
    ],
  });
  const boxes = new Map([
    ['kenny/inner@v1', box(['low', 'high'])],
    ['kenny/inner@v2', box(['low'])],
  ]);

  it('takes a value its box declares, and refuses one it does not', () => {
    expect(valueRefusal(boxed, primitives, 0, 'level', 'low', [], boxes)).toBeNull();
    expect(valueRefusal(boxed, primitives, 0, 'level', 'mid', [], boxes)).toBe(
      'This takes one of low, high.',
    );
  });

  it('offers its text and number outputs to be reported, with their types', () => {
    expect(outputSources(boxed, primitives, boxes)).toEqual([
      { kind: 'steps', name: 'build', output: 'took_ms' },
    ]);
    expect(
      outputType(
        boxed,
        primitives,
        { kind: 'steps', name: 'build', output: 'took_ms' },
        boxes,
      ),
    ).toBe('number');
  });

  it('refuses a version whose box would refuse a value the step gives', () => {
    const moved = readWorkflow(
      parse('steps:\n  - {id: build, use: kenny/inner@v2, with: {level: high}}\n'),
    );
    expect(newProblem(boxed, moved, primitives, boxes)).toBe(
      'build.level: This takes one of low.',
    );
  });
});
