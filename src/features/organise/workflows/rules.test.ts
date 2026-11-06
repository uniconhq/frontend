import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { acceptsOf, CLASSIC, PRIMITIVES } from '@/test/workflows';
import { readWorkflow, type Ref } from './model';
import { byRef, type PrimitiveInfo } from './primitives';
import {
  dragRefusal,
  orderAfterWire,
  outputSources,
  outputType,
  portFor,
} from './rules';

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
      accepts: acceptsOf('enum'),
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
      accepts: acceptsOf('text'),
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
      accepts: null,
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
      accepts: null,
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

/** What exec's one form needs, so a step given it is a program compiled and run. */
const RUNS =
  'source: "${{ inputs.submission }}", language: c, stdin: "${{ inputs.input }}", time_limit: 1, memory_limit: 256';

const WORKFLOW = readWorkflow(
  parse(`
inputs:
  submission: file
  language: {type: enum, options: [c, cpp]}
  wide: {type: enum, options: [c, cobol]}
  mode: {type: enum, options: [exact]}
  input: file
  limit: number
  episodes: number
  key: {type: text, optional: true}
  maybe: {type: folder, optional: true}
  flag: boolean
steps:
  - {id: build, use: unicon/exec@v4, with: {source: "\${{ inputs.submission }}", language: c}}
  - {id: run, use: unicon/exec@v4, with: {${RUNS}, args: "\${{ steps.build.log }}"}}
  - {id: check, use: unicon/checker-like@v1, with: {}}
  - {id: late, use: unicon/exec@v4, with: {source: "\${{ inputs.submission }}", language: c}}
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
    [
      'an enum into an enum port, its options checked after the drop',
      0,
      'language',
      input('wide'),
    ],
    ['a number into a text port', 1, 'args', input('limit')],
    ['a boolean into a text port', 1, 'args', input('flag')],
    ['a file input into a file port', 1, 'stdin', input('input')],
    [
      'an optional input into a required port, checked after the drop',
      0,
      'source',
      input('maybe'),
    ],
    [
      'a step output into a port that raises a limit, checked after the drop',
      1,
      'time_limit',
      output('check', 'fraction'),
    ],
    [
      'a workflow file into a folder port',
      0,
      'source',
      { kind: 'workflow', name: 'checker/program.yaml' },
    ],
  ] as const)('lets %s be dropped', (_, step, port, source) => {
    expect(dragRefusal(WORKFLOW, primitives, step, port, source)).toBeNull();
  });

  it.each([
    [
      'a number into a folder port',
      0,
      'source',
      input('limit'),
      'This takes a file or a folder, not a number.',
    ],
    [
      'a boolean into a file port',
      1,
      'stdin',
      input('flag'),
      'This takes a file, not true or false.',
    ],
    [
      'a number output into a file port',
      1,
      'stdin',
      output('check', 'fraction'),
      'This takes a file, not a number.',
    ],
    [
      'a number into an enum port',
      2,
      'mode',
      output('run', 'time_ms'),
      'This takes one of a list, not a number.',
    ],
    [
      'a folder into a file port',
      1,
      'stdin',
      { kind: 'workflow', name: 'checker/' },
      'This takes a file, not a folder.',
    ],
    [
      'an outcome',
      3,
      'entry',
      output('check', 'outcome'),
      'This takes text, a number, true or false or one of a list, not an outcome.',
    ],
    [
      'a step reading its own output',
      1,
      'memory_limit',
      output('run', 'time_ms'),
      'A step can’t read its own output.',
    ],
    [
      'a loop',
      0,
      'entry',
      output('run', 'log'),
      'That would make a loop: run already reads this step.',
    ],
  ] as const)('greys out %s', (_, step, port, source, reason) => {
    expect(dragRefusal(WORKFLOW, primitives, step, port, source)).toBe(reason);
  });

  it('lets a step read one listed after it when that makes no loop', () => {
    expect(
      dragRefusal(WORKFLOW, primitives, 0, 'entry', output('late', 'log')),
    ).toBeNull();
  });

  it('moves the fewest steps when a step comes to read a later one', () => {
    const workflow = readWorkflow(
      parse(`
steps:
  - {id: a, use: unicon/exec@v4}
  - {id: b, use: unicon/exec@v4, with: {entry: "\${{ steps.a.log }}"}}
  - {id: c, use: unicon/exec@v4, with: {entry: "\${{ steps.b.log }}"}}
  - {id: d, use: unicon/exec@v4}
`),
    );

    expect(orderAfterWire(workflow, 0, 3)).toEqual([3, 0, 1, 2]);
    expect(orderAfterWire(workflow, 2, 3)).toEqual([0, 1, 3, 2]);
  });
});

describe('a wire dropped on a box', () => {
  it('goes to the input named as its source, given or not', () => {
    expect(portFor(WORKFLOW, primitives, 1, input('language'))).toEqual({
      port: 'language',
    });
  });

  it('else goes to the first input given nothing, leaving the refusal to the drag rules', () => {
    expect(portFor(WORKFLOW, primitives, 1, input('input'))).toEqual({ port: 'entry' });
    expect(dragRefusal(WORKFLOW, primitives, 1, 'entry', input('input'))).toBe(
      'This takes text, a number, true or false or one of a list, not a file.',
    );
  });

  it('passes over a port of named files, which one wire cannot fill', () => {
    const given = readWorkflow(
      parse(`
inputs:
  submission: file
  input: file
steps:
  - {id: run, use: unicon/exec@v4, with: {${RUNS}, entry: main.c}}
`),
    );
    expect(portFor(given, primitives, 0, input('input'))).toEqual({ port: 'manifest' });
    expect(dragRefusal(given, primitives, 0, 'files', input('input'))).toBe(
      'This takes named files, which no wire gives.',
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
          description: null,
          inputs: [
            {
              name: 'source',
              type: 'folder',
              optional: false,
              options: null,
              accepts: acceptsOf('folder'),
            },
          ],
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
    expect(portFor(full, primitives, 1, input('submission'))).toEqual({
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
  const boxes = new Map([
    [
      'kenny/inner@v1',
      {
        run: true,
        newer: null,
        description: null,
        inputs: [
          {
            name: 'level',
            type: 'enum',
            optional: false,
            options: ['low', 'high'],
            accepts: acceptsOf('enum'),
          },
        ],
        outputs: [
          { name: 'program', type: 'file' },
          { name: 'took_ms', type: 'number' },
        ],
      },
    ],
  ]);

  it('takes a wire its box says the port accepts', () => {
    const given = readWorkflow(
      parse(`
inputs:
  level: {type: enum, options: [low]}
  count: number
steps:
  - {id: build, use: kenny/inner@v1, with: {}}
`),
    );
    expect(
      dragRefusal(given, primitives, 0, 'level', input('level'), boxes),
    ).toBeNull();
    expect(dragRefusal(given, primitives, 0, 'level', input('count'), boxes)).toBe(
      'This takes one of a list, not a number.',
    );
  });

  it('offers every output to be named, with its type', () => {
    expect(outputSources(boxed, primitives, boxes)).toEqual([
      { kind: 'steps', name: 'build', output: 'program' },
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
});
