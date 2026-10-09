import { describe, expect, it } from 'vitest';
import { CLASSIC_V2, PRIMITIVES } from '@/test/workflows';
import {
  addStep,
  clearPort,
  removeEntry,
  removeInput,
  removeStep,
  renameField,
  renameInput,
  renameStep,
  setEntry,
  setField,
  setInput,
  setPerTest,
  setValue,
  wire,
  workflowOf,
} from './edit';

const [, compile, , diff, , run] = PRIMITIVES;

const COMMENTED = `# A workflow with its notes kept.
inputs:
  submission: {type: file, contestant: true}  # what they send
  time_limit: number
test:
  input: file
steps:
  # compile once
  - id: compile
    use: unicon/compile@v2
    with:
      source: \${{ inputs.submission }}
      language: c
  - id: run
    use: unicon/sandbox-run@v2
    per_test: true
    with:
      binary: \${{ steps.compile.binary }}
      input: \${{ test.input }}
      args: "--limit \${{ inputs.time_limit }}"
      time_limit: \${{ inputs.time_limit }}
      memory_limit: 256
report:
  log: \${{ steps.compile.compile_log }}  # shown, never ranked
`;

const ids = (text: string) => workflowOf(text).steps.map((step) => step.id);

describe('editing the file in place', () => {
  it('keeps every comment through an edit elsewhere', () => {
    const after = setValue(COMMENTED, 1, 'memory_limit', 512);

    expect(after).toContain('# A workflow with its notes kept.');
    expect(after).toContain('# what they send');
    expect(after).toContain('# compile once');
    expect(after).toContain('# shown, never ranked');
    expect(after).toContain('memory_limit: 512');
  });

  it('keeps the comment on the line of a declaration it changes', () => {
    const changed = setInput(COMMENTED, 'submission', {
      type: 'folder',
      contestant: true,
    });

    expect(changed).toContain(
      'submission: {type: folder, contestant: true} # what they send',
    );
  });

  it('keeps a step with no id at its own place', () => {
    const text = [
      'test: {a: file}',
      'steps:',
      '  - use: unicon/compile@v2',
      '  - {id: b, use: unicon/compile@v2}',
      '',
    ].join('\n');

    expect(workflowOf(text).steps.map((step) => step.id)).toEqual(['', 'b']);
    expect(renameStep(text, 1, 'c')).toContain('id: c');
  });

  it('quotes text the forge would read as true, false or a number', () => {
    let text = setValue(COMMENTED, 1, 'args', 'on');
    text = setInput(text, 'mode', {
      type: 'enum',
      options: ['yes', 'no', 'y', '1_000'],
    });

    expect(text).toContain('args: "on"');
    expect(text).toContain('mode: {type: enum, options: ["yes", "no", y, "1_000"]}');
    expect(workflowOf(text).steps[1]?.with.args).toEqual({
      kind: 'literal',
      value: 'on',
    });
    const plain = [
      'test: {a: file}',
      'steps:',
      '  - {id: s, use: u, with: {x: on, y: y}}',
    ];
    expect(workflowOf(plain.join('\n')).steps[0]?.with).toEqual({
      x: { kind: 'literal', value: true },
      y: { kind: 'literal', value: 'y' },
    });
  });

  it('writes the first port of a new step as a block', () => {
    const added = addStep(COMMENTED, diff!, true);
    const wired = wire(added, 2, 'actual', {
      kind: 'steps',
      name: 'run',
      output: 'output',
    });

    expect(wired).toContain(
      [
        '  - id: diff-check',
        '    use: unicon/diff-check@v2',
        '    per_test: true',
        '    with:',
        '      actual: ${{ steps.run.output }}',
        '',
      ].join('\n'),
    );
  });

  it('adds a step named for its primitive, a once step before every per-test one', () => {
    const once = addStep(COMMENTED, compile!);
    const perTest = addStep(COMMENTED, diff!, true);

    expect(ids(once)).toEqual(['compile', 'compile-2', 'run']);
    expect(workflowOf(once).steps[1]?.use).toBe('unicon/compile@v2');
    expect(ids(perTest)).toEqual(['compile', 'run', 'diff-check']);
    expect(workflowOf(perTest).steps[2]?.perTest).toBe(true);
  });

  it('wires a port and gives one a value or nothing', () => {
    const wired = wire(COMMENTED, 0, 'entry', { kind: 'inputs', name: 'submission' });
    const valued = setValue(COMMENTED, 0, 'language', 'cpp');
    const cleared = clearPort(COMMENTED, 1, 'args');

    expect(workflowOf(wired).steps[0]?.with.entry).toEqual({
      kind: 'wire',
      ref: { kind: 'inputs', name: 'submission' },
    });
    expect(workflowOf(valued).steps[0]?.with.language).toEqual({
      kind: 'literal',
      value: 'cpp',
    });
    expect(workflowOf(cleared).steps[1]?.with.args).toBeUndefined();
    expect(cleared).toContain('# compile once');
  });

  it('moves the steps when a step comes to read a later one', () => {
    const added = addStep(COMMENTED, compile!);
    const moved = wire(added, 0, 'source', {
      kind: 'steps',
      name: 'compile-2',
      output: 'binary',
    });

    expect(ids(moved)).toEqual(['compile-2', 'compile', 'run']);
    expect(moved).toContain('# compile once');
  });

  it('removes a step with every wire from it, and undoing is the text before', () => {
    const removed = removeStep(COMMENTED, 0);

    expect(ids(removed)).toEqual(['run']);
    expect(workflowOf(removed).steps[0]?.with.binary).toBeUndefined();
    expect(workflowOf(removed).report).toEqual([]);
    expect(workflowOf(removed).steps[0]?.with.input).toBeDefined();
  });

  it('renames a step, an input and a field, every reference following', () => {
    const step = renameStep(COMMENTED, 0, 'build');
    const input = renameInput(COMMENTED, 'time_limit', 'limit');
    const field = renameField(COMMENTED, 'input', 'stdin');

    expect(step).toContain('binary: ${{ steps.build.binary }}');
    expect(step).toContain('log: ${{ steps.build.compile_log }}');
    expect(input).toContain('limit: number');
    expect(input).toContain('args: "--limit ${{ inputs.limit }}"');
    expect(input).toContain('time_limit: ${{ inputs.limit }}');
    expect(field).toContain('stdin: file');
    expect(field).toContain('input: ${{ test.stdin }}');
  });

  it('switches a step to per test and back, keeping once steps first', () => {
    const added = addStep(COMMENTED, compile!);
    const perTest = setPerTest(added, 0, true);

    expect(ids(perTest)).toEqual(['compile-2', 'compile', 'run']);
    expect(workflowOf(perTest).steps[1]?.perTest).toBe(true);
    const back = setPerTest(perTest, 1, false);
    expect(ids(back)).toEqual(['compile-2', 'compile', 'run']);
    expect(workflowOf(back).steps[1]?.perTest).toBe(false);
  });

  it('declares inputs and fields in the short form when only the type is given', () => {
    const declared = setInput(COMMENTED, 'language', {
      type: 'enum',
      options: ['c', 'cpp'],
      contestant: true,
    });
    const field = setField(COMMENTED, 'answer', { type: 'file', public: true });
    const plain = setInput(COMMENTED, 'episodes', { type: 'number', optional: false });

    expect(declared).toContain(
      'language: {type: enum, options: [c, cpp], contestant: true}',
    );
    expect(field).toContain('answer: {type: file, public: true}');
    expect(plain).toContain('episodes: number');
    expect(declared).toContain('# what they send');
  });

  it('removes an input with every port reading it', () => {
    const removed = removeInput(COMMENTED, 'time_limit');

    const runStep = workflowOf(removed).steps[1];
    expect(runStep?.with.args).toBeUndefined();
    expect(runStep?.with.time_limit).toBeUndefined();
    expect(workflowOf(removed).inputs.map((each) => each.id)).toEqual(['submission']);
  });

  it('writes a report entry short, or with what its number means', () => {
    const short = setEntry(COMMENTED, 'time', {
      from: { kind: 'steps', name: 'run', output: 'time_ms' },
    });
    const meant = setEntry(COMMENTED, 'time', {
      from: { kind: 'steps', name: 'run', output: 'time_ms' },
      fold: 'max',
      better: 'lower',
      at_least: 0,
    });

    expect(short).toContain('time: ${{ steps.run.time_ms }}');
    expect(meant).toContain(
      'time: {from: "${{ steps.run.time_ms }}", fold: max, better: lower, at_least: 0}',
    );
    expect(
      workflowOf(removeEntry(meant, 'time')).report.map((entry) => entry.name),
    ).toEqual(['log']);
  });

  it('builds classic from an empty file', () => {
    let text = '';
    text = setInput(text, 'submission', { type: 'file', contestant: true });
    text = setField(text, 'input', { type: 'file' });
    text = addStep(text, compile!);
    text = addStep(text, run!, true);
    text = wire(text, 0, 'source', { kind: 'inputs', name: 'submission' });
    text = wire(text, 1, 'binary', {
      kind: 'steps',
      name: 'compile',
      output: 'binary',
    });

    expect(text.indexOf('inputs:')).toBeLessThan(text.indexOf('test:'));
    expect(text.indexOf('test:')).toBeLessThan(text.indexOf('steps:'));
    expect(ids(text)).toEqual(['compile', 'sandbox-run']);
    expect(CLASSIC_V2.length).toBeGreaterThan(0);
  });
});
