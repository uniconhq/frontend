import { describe, expect, it } from 'vitest';
import type { Values } from '../forms/values';
import { CLASSIC, PRIMITIVES, valuesOf } from '@/test/workflows';
import {
  addStep,
  clearPort,
  entryFields,
  fileToInput,
  idOfPath,
  inputToFile,
  moveFile,
  removeEntry,
  removeInput,
  removeStep,
  renameInput,
  renameStep,
  setDescription,
  setEntry,
  setInput,
  setValue,
  wire,
} from './edit';
import { readWorkflow, refText } from './model';

const [, diff, , exec] = PRIMITIVES;

const BASE: Values = {
  inputs: {
    submission: { type: 'file', title: 'Solution' },
    time_limit: 'number',
    input: 'file',
    answer: 'file',
  },
  steps: [
    {
      id: 'run',
      use: 'unicon/exec@v4',
      with: {
        source: '${{ inputs.submission }}',
        language: 'c',
        stdin: '${{ inputs.input }}',
        args: '--limit ${{ inputs.time_limit }}',
        time_limit: '${{ inputs.time_limit }}',
        memory_limit: 256,
      },
    },
    {
      id: 'check',
      use: 'unicon/diff-check@v2',
      with: {
        actual: '${{ steps.run.output }}',
        expected: '${{ inputs.answer }}',
      },
    },
  ],
  outputs: { log: '${{ steps.run.log }}' },
};

const ids = (values: Values) => readWorkflow(values).steps.map((step) => step.id);
/** The `with` of the step at `index`. */
const given = (values: Values, index: number) =>
  ((values.steps as Values[])[index]?.with ?? {}) as Values;

describe('editing the draft’s values', () => {
  it('changes a copy, leaving the values it was given as they were', () => {
    const before = structuredClone(BASE);
    setValue(BASE, 0, 'memory_limit', 512);
    removeStep(BASE, 0);
    renameInput(BASE, 'time_limit', 'limit');

    expect(BASE).toEqual(before);
  });

  it('gives a port a number, a boolean or text', () => {
    let values = setValue(BASE, 0, 'memory_limit', 512);
    values = setValue(values, 0, 'self_reported', true);
    values = setValue(values, 0, 'args', '2026-10-09');

    expect(given(values, 0)).toMatchObject({
      memory_limit: 512,
      self_reported: true,
      args: '2026-10-09',
    });
    expect(readWorkflow(values).steps[0]?.with.memory_limit).toEqual({
      kind: 'literal',
      value: 512,
    });
  });

  it('keeps a step with no id at its own place', () => {
    const values: Values = {
      inputs: { a: 'file' },
      steps: [{ use: 'unicon/exec@v4' }, { id: 'b', use: 'unicon/exec@v4' }],
    };

    expect(ids(values)).toEqual(['', 'b']);
    expect(ids(renameStep(values, 1, 'c'))).toEqual(['', 'c']);
  });

  it('keeps a title when the unit is set', () => {
    const from = { kind: 'steps' as const, name: 'run', output: 'time_ms' };
    const titled = setEntry(BASE, 'time', { from, title: 'Run time' });
    const withUnit = setEntry(titled, 'time', { from, title: 'Run time', unit: 'ms' });

    expect((withUnit.outputs as Values).time).toEqual({
      from: '${{ steps.run.time_ms }}',
      title: 'Run time',
      unit: 'ms',
    });
  });

  it('adds a step named for its primitive, at the end, with nothing given yet', () => {
    const once = addStep(BASE, exec!);
    const again = addStep(once, exec!);
    const check = addStep(BASE, diff!);

    expect(ids(again)).toEqual(['run', 'check', 'exec', 'exec-2']);
    expect((again.steps as Values[])[3]).toEqual({
      id: 'exec-2',
      use: 'unicon/exec@v4',
      with: {},
    });
    expect(ids(check)).toEqual(['run', 'check', 'diff-check']);
  });

  it('adds the first step to a draft with no steps', () => {
    expect(addStep({}, exec!)).toEqual({
      steps: [{ id: 'exec', use: 'unicon/exec@v4', with: {} }],
    });
  });

  it('wires a port and gives one a value or nothing', () => {
    const wired = wire(BASE, 0, 'entry', { kind: 'inputs', name: 'submission' });
    const valued = setValue(BASE, 0, 'language', 'cpp');
    const cleared = clearPort(BASE, 0, 'args');

    expect(given(wired, 0).entry).toBe('${{ inputs.submission }}');
    expect(given(valued, 0).language).toBe('cpp');
    expect(given(cleared, 0)).not.toHaveProperty('args');
  });

  it('gives a step with no with a mapping for its first port', () => {
    const added = addStep({ steps: [{ id: 'a', use: 'unicon/exec@v4' }] }, diff!);
    const wired = wire(added, 0, 'stdin', { kind: 'inputs', name: 'input' });

    expect(given(wired, 0)).toEqual({ stdin: '${{ inputs.input }}' });
  });

  it('moves the steps when a step comes to read a later one', () => {
    const added = addStep(BASE, exec!);
    const moved = wire(added, 0, 'entry', {
      kind: 'steps',
      name: 'exec',
      output: 'log',
    });

    expect(ids(moved)).toEqual(['exec', 'run', 'check']);
    expect(given(moved, 1).entry).toBe('${{ steps.exec.log }}');
  });

  it('removes a step with every wire from it and every output reading it', () => {
    const removed = removeStep(BASE, 0);

    expect(ids(removed)).toEqual(['check']);
    expect(given(removed, 0)).toEqual({ expected: '${{ inputs.answer }}' });
    expect(removed.outputs).toEqual({});
  });

  it('renames a step and an input, every reference following, the input in its place', () => {
    const step = renameStep(BASE, 0, 'solution');
    const input = renameInput(BASE, 'time_limit', 'limit');

    expect(given(step, 1).actual).toBe('${{ steps.solution.output }}');
    expect(step.outputs).toEqual({ log: '${{ steps.solution.log }}' });
    expect(Object.keys(input.inputs as Values)).toEqual([
      'submission',
      'limit',
      'input',
      'answer',
    ]);
    expect(given(input, 0)).toMatchObject({
      args: '--limit ${{ inputs.limit }}',
      time_limit: '${{ inputs.limit }}',
    });
  });

  it('declares inputs in the short form when only the type is given', () => {
    let values = setInput(BASE, 'language', { type: 'enum', options: ['c', 'cpp'] });
    values = setInput(values, 'key', { type: 'text', optional: true });
    values = setInput(values, 'episodes', { type: 'number', optional: false });

    expect(values.inputs).toMatchObject({
      language: { type: 'enum', options: ['c', 'cpp'] },
      key: { type: 'text', optional: true },
      episodes: 'number',
    });
  });

  it('names an input for the task’s form, and leaves out what is empty', () => {
    const helped = setInput(BASE, 'time_limit', {
      type: 'number',
      title: 'Time limit',
      unit: 's',
      help: 'The time the program may use.',
    });
    expect((helped.inputs as Values).time_limit).toEqual({
      type: 'number',
      title: 'Time limit',
      unit: 's',
      help: 'The time the program may use.',
    });
    const plain = setInput(helped, 'time_limit', {
      type: 'number',
      title: '',
      unit: null,
      help: 'The time the program may use.',
    });
    expect((plain.inputs as Values).time_limit).toEqual({
      type: 'number',
      help: 'The time the program may use.',
    });
  });

  it('removes an input with every port reading it', () => {
    const removed = removeInput(BASE, 'time_limit');

    expect(given(removed, 0)).not.toHaveProperty('args');
    expect(given(removed, 0)).not.toHaveProperty('time_limit');
    expect(readWorkflow(removed).inputs.map((each) => each.id)).toEqual([
      'submission',
      'input',
      'answer',
    ]);
  });

  it('writes what the workflow does first, and removes it when nothing is said', () => {
    const said = setDescription(BASE, '  Runs it once.  ');
    const twice = setDescription(said, 'Compiles it.\nThen runs it once.');

    expect(Object.keys(said)[0]).toBe('description');
    expect(said.description).toBe('Runs it once.');
    expect(twice.description).toBe('Compiles it.\nThen runs it once.');
    expect(setDescription(twice, '   ')).not.toHaveProperty('description');
  });

  it('writes an output short, or with what its number means', () => {
    const from = { kind: 'steps' as const, name: 'run', output: 'time_ms' };
    const short = setEntry(BASE, 'time', { from });
    const meant = setEntry(BASE, 'time', { from, title: 'Run time', unit: 'ms' });

    expect((short.outputs as Values).time).toBe('${{ steps.run.time_ms }}');
    expect((meant.outputs as Values).time).toEqual({
      from: '${{ steps.run.time_ms }}',
      title: 'Run time',
      unit: 'ms',
    });
    expect(removeEntry(meant, 'time').outputs).toEqual({ log: '${{ steps.run.log }}' });
  });

  it('writes an output with a title as a mapping, and short again once it has none (M58)', () => {
    const log = readWorkflow(BASE).outputs.find((entry) => entry.name === 'log')!;
    const from = log.from!;
    const titled = setEntry(
      BASE,
      'log',
      entryFields(log, 'text', { from, title: 'Compile log', unit: 'lines' }),
    );

    expect((titled.outputs as Values).log).toEqual({
      from: refText(from),
      title: 'Compile log',
    });
    const titledLog = readWorkflow(titled).outputs[0]!;
    expect(titledLog).toMatchObject({ title: 'Compile log', unit: null, short: false });
    const plain = setEntry(
      titled,
      'log',
      entryFields(titledLog, 'text', { from, title: null }),
    );
    expect((plain.outputs as Values).log).toBe(refText(from));
  });

  it('keeps an output’s unit while it reads a number, or what it reads is not known', () => {
    const entry = {
      ...readWorkflow(BASE).outputs.find((found) => found.name === 'log')!,
      title: 'Run time',
      unit: 'ms',
    };
    const time = { kind: 'steps' as const, name: 'run', output: 'time_ms' };

    expect(entryFields(entry, 'number', { from: time })).toMatchObject({
      title: 'Run time',
      unit: 'ms',
    });
    expect(entryFields(entry, null, { from: time }).unit).toBe('ms');
    expect(entryFields(entry, 'text', { from: time })).toMatchObject({
      title: 'Run time',
      unit: null,
    });
  });

  it('builds classic from an empty draft, its parts in the format’s order', () => {
    let values: Values = {};
    values = setEntry(values, 'time_ms', {
      from: { kind: 'steps', name: 'exec', output: 'time_ms' },
    });
    values = addStep(values, exec!);
    values = addStep(values, diff!);
    values = setInput(values, 'submission', { type: 'file' });
    values = setInput(values, 'input', { type: 'file' });
    values = wire(values, 0, 'source', { kind: 'inputs', name: 'submission' });
    values = wire(values, 0, 'stdin', { kind: 'inputs', name: 'input' });
    values = wire(values, 1, 'actual', {
      kind: 'steps',
      name: 'exec',
      output: 'output',
    });

    expect(Object.keys(values)).toEqual(['inputs', 'steps', 'outputs']);
    expect(ids(values)).toEqual(['exec', 'diff-check']);
    expect(readWorkflow(values).inputs.map((input) => input.id)).toEqual(
      readWorkflow(valuesOf(CLASSIC))
        .inputs.map((input) => input.id)
        .filter((id) => id === 'submission' || id === 'input'),
    );
  });

  it('reads a named set of files and a step output with a dotted name', () => {
    const values: Values = {
      steps: [
        {
          id: 'compare',
          use: 'unicon/exec@v4',
          with: {
            source: '${{ workflow.diff/ }}',
            manifest: '${{ workflow.diff/program.yaml }}',
            files: {
              output: '${{ steps.solution.output }}',
              answer: '${{ inputs.answer }}',
            },
          },
        },
      ],
      outputs: {
        time_ms: {
          from: '${{ steps.game.entrant.time_ms }}',
          title: 'Run time',
          unit: 'ms',
        },
      },
    };
    const workflow = readWorkflow(values);
    expect(workflow.steps[0]?.with.files?.kind).toBe('mapping');
    expect(workflow.steps[0]?.with.manifest).toMatchObject({
      kind: 'wire',
      ref: { kind: 'workflow', name: 'diff/program.yaml' },
    });
    expect(workflow.outputs[0]).toMatchObject({
      name: 'time_ms',
      title: 'Run time',
      unit: 'ms',
      from: { kind: 'steps', name: 'game', output: 'entrant.time_ms' },
    });
  });

  it('writes a workflow-owned folder wire', () => {
    const values = wire(BASE, 0, 'source', { kind: 'workflow', name: 'checker/' });

    expect(readWorkflow(values).steps[0]?.with.source).toEqual({
      kind: 'wire',
      ref: { kind: 'workflow', name: 'checker/' },
    });
  });
});

describe('an input given by the workflow, and a file given by the task', () => {
  const READS: Values = {
    inputs: { answer: { type: 'file', title: 'Answer' }, input: 'file' },
    steps: [
      {
        id: 'check',
        use: 'unicon/exec@v4',
        with: {
          stdin: '${{ inputs.input }}',
          files: { answer: '${{ inputs.answer }}' },
          args: '--answer ${{ inputs.answer }}',
        },
      },
    ],
  };

  it('makes every reader of an input read the file instead, and drops the input', () => {
    const values = inputToFile(READS, 'answer', 'data/answer.txt');

    expect(values.inputs).toEqual({ input: 'file' });
    expect(given(values, 0)).toEqual({
      stdin: '${{ inputs.input }}',
      files: { answer: '${{ workflow.data/answer.txt }}' },
      args: '--answer ${{ workflow.data/answer.txt }}',
    });
  });

  it('makes a file an input again, read wherever the file was', () => {
    const back = fileToInput(
      inputToFile(READS, 'answer', 'data/answer.txt'),
      'data/answer.txt',
      'answer',
      'file',
    );

    expect((back.inputs as Values).answer).toBe('file');
    expect(given(back, 0).files).toEqual({ answer: '${{ inputs.answer }}' });
    expect(JSON.stringify(back)).not.toContain('workflow.');
  });

  it('declares the first input of a workflow that had none, before its steps', () => {
    const values: Values = {
      steps: [
        {
          id: 'diff',
          use: 'unicon/exec@v4',
          with: { source: '${{ workflow.diff/ }}' },
        },
      ],
    };
    const back = fileToInput(values, 'diff/', 'diff', 'folder');

    expect(Object.keys(back)).toEqual(['inputs', 'steps']);
    expect(readWorkflow(back).inputs).toMatchObject([{ id: 'diff', type: 'folder' }]);
    expect(given(back, 0).source).toBe('${{ inputs.diff }}');
  });

  it('moves the readers of one file to another, and no other reference', () => {
    const values = setValue(
      inputToFile(READS, 'answer', 'a.txt'),
      0,
      'stdin',
      '${{ workflow.a.txt.bak }}',
    );
    const moved = moveFile(values, 'a.txt', 'b.txt');

    expect(given(moved, 0).files).toEqual({ answer: '${{ workflow.b.txt }}' });
    expect(given(moved, 0).stdin).toBe('${{ workflow.a.txt.bak }}');
  });

  it('names an input after a path’s last part, without its extension', () => {
    expect(idOfPath('diff/')).toBe('diff');
    expect(idOfPath('checker/program.yaml')).toBe('program');
    expect(idOfPath('Data Sets/answer-1.txt')).toBe('answer_1');
    expect(idOfPath('.hidden')).toBe('file');
    // The forge takes a name only when it starts with a letter.
    expect(idOfPath('tests/01.in')).toBe('file_01');
    expect(idOfPath(`${'a'.repeat(39)}_b.txt`)).toBe('a'.repeat(39));
  });
});
