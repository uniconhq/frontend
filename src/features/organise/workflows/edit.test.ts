import { describe, expect, it } from 'vitest';
import { CLASSIC, PRIMITIVES } from '@/test/workflows';
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
  workflowOf,
} from './edit';
import { NumberText } from '../forms/yaml-doc';
import { refText } from './model';

const [, diff, , exec] = PRIMITIVES;

const COMMENTED = `# A workflow with its notes kept.
inputs:
  submission: {type: file, title: Solution}  # what they send
  time_limit: number
  input: file
  answer: file
steps:
  # compile and run once
  - id: run
    use: unicon/exec@v2
    with:
      source: \${{ inputs.submission }}
      language: c
      stdin: \${{ inputs.input }}
      args: "--limit \${{ inputs.time_limit }}"
      time_limit: \${{ inputs.time_limit }}
      memory_limit: 256
  - id: check
    use: unicon/diff-check@v2
    with:
      actual: \${{ steps.run.output }}
      expected: \${{ inputs.answer }}
outputs:
  log: \${{ steps.run.log }}  # shown, never ranked
`;

const ids = (text: string) => workflowOf(text).steps.map((step) => step.id);

describe('editing the file in place', () => {
  it('keeps every comment through an edit elsewhere', () => {
    const after = setValue(COMMENTED, 0, 'memory_limit', new NumberText('512'));

    expect(after).toContain('# A workflow with its notes kept.');
    expect(after).toContain('# what they send');
    expect(after).toContain('# compile and run once');
    expect(after).toContain('# shown, never ranked');
    expect(after).toContain('memory_limit: 512');
  });

  it('keeps the comment on the line of a port it gives a value', () => {
    const commented = COMMENTED.replace(
      'memory_limit: 256',
      'memory_limit: 256 # megabytes',
    );

    expect(setValue(commented, 0, 'memory_limit', new NumberText('512'))).toContain(
      'memory_limit: 512 # megabytes',
    );
  });

  it('keeps the comment on the line of a declaration it changes', () => {
    const changed = setInput(COMMENTED, 'submission', {
      type: 'folder',
      title: 'Solution',
    });

    expect(changed).toContain(
      'submission: {type: folder, title: Solution} # what they send',
    );
  });

  it('keeps a step with no id at its own place', () => {
    const text = [
      'inputs: {a: file}',
      'steps:',
      '  - use: unicon/exec@v2',
      '  - {id: b, use: unicon/exec@v2}',
      '',
    ].join('\n');

    expect(workflowOf(text).steps.map((step) => step.id)).toEqual(['', 'b']);
    expect(renameStep(text, 1, 'c')).toContain('id: c');
  });

  it('writes a name that looks like a date plain, as a key and as an id', () => {
    const renamed = renameInput(
      renameStep(COMMENTED, 0, '2024-01-01'),
      'time_limit',
      '2024-01-02',
    );
    const added = setInput(renamed, '2024-01-03', { type: 'number' });

    expect(added).toContain('id: 2024-01-01');
    expect(added).toContain('2024-01-02: number');
    expect(added).toContain('2024-01-03: number');
    expect(added).toContain('${{ inputs.2024-01-02 }}');
  });

  it('writes text that looks like a date plain', () => {
    const text = setValue(COMMENTED, 0, 'args', '2026-10-09');

    expect(workflowOf(text).steps[0]?.with.args).toEqual({
      kind: 'literal',
      value: '2026-10-09',
    });
    expect(
      setInput(text, 'when', { type: 'enum', options: ['2026-10-09', 'later'] }),
    ).toContain('when: {type: enum, options: [2026-10-09, later]}');
  });

  it('writes yes, no and on plain, and quotes what 1.2 reads as true, false or a number', () => {
    let text = setValue(COMMENTED, 0, 'args', 'on');
    text = setInput(text, 'mode', {
      type: 'enum',
      options: ['yes', 'no', 'true', '1_000', '12'],
    });

    expect(text).toContain(
      'mode: {type: enum, options: [yes, no, "true", 1_000, "12"]}',
    );
    expect(workflowOf(text).steps[0]?.with.args).toEqual({
      kind: 'literal',
      value: 'on',
    });
    const plain = [
      'inputs: {a: file}',
      'steps:',
      '  - {id: s, use: u, with: {x: on, y: true, z: 0.123456789012345678901234567891}}',
    ];
    expect(workflowOf(plain.join('\n')).steps[0]?.with).toEqual({
      x: { kind: 'literal', value: 'on' },
      y: { kind: 'literal', value: true },
      z: { kind: 'literal', value: new NumberText('0.123456789012345678901234567891') },
    });
  });

  it('keeps a title when the unit is set', () => {
    const titled = setEntry(COMMENTED, 'time', {
      from: { kind: 'steps', name: 'run', output: 'time_ms' },
      title: 'Run time',
    });
    const withUnit = setEntry(titled, 'time', {
      from: { kind: 'steps', name: 'run', output: 'time_ms' },
      title: 'Run time',
      unit: 'ms',
    });
    expect(withUnit).toContain('title: Run time');
    expect(withUnit).toContain('unit: ms');
  });

  it('writes the first port of a new step as a block', () => {
    const added = addStep(COMMENTED, diff!);
    const wired = wire(added, 2, 'actual', {
      kind: 'steps',
      name: 'run',
      output: 'output',
    });

    expect(wired).toContain(
      [
        '  - id: diff-check',
        '    use: unicon/diff-check@v2',
        '    with:',
        '      actual: ${{ steps.run.output }}',
        '',
      ].join('\n'),
    );
  });

  it('adds the first step to an empty steps: [] as a block', () => {
    const added = addStep('steps: []\n', exec!);

    expect(added).toBe('steps:\n  - id: exec\n    use: unicon/exec@v2\n    with: {}\n');
  });

  it('adds a step named for its primitive, at the end', () => {
    const once = addStep(COMMENTED, exec!);
    const again = addStep(once, exec!);
    const check = addStep(COMMENTED, diff!);

    expect(ids(again)).toEqual(['run', 'check', 'exec', 'exec-2']);
    expect(workflowOf(again).steps[3]?.use).toBe('unicon/exec@v2');
    expect(ids(check)).toEqual(['run', 'check', 'diff-check']);
  });

  it('wires a port and gives one a value or nothing', () => {
    const wired = wire(COMMENTED, 0, 'entry', { kind: 'inputs', name: 'submission' });
    const valued = setValue(COMMENTED, 0, 'language', 'cpp');
    const cleared = clearPort(COMMENTED, 0, 'args');

    expect(workflowOf(wired).steps[0]?.with.entry).toEqual({
      kind: 'wire',
      ref: { kind: 'inputs', name: 'submission' },
    });
    expect(workflowOf(valued).steps[0]?.with.language).toEqual({
      kind: 'literal',
      value: 'cpp',
    });
    expect(workflowOf(cleared).steps[0]?.with.args).toBeUndefined();
    expect(cleared).toContain('# compile and run once');
  });

  it('moves the steps when a step comes to read a later one', () => {
    const added = addStep(COMMENTED, exec!);
    const moved = wire(added, 0, 'entry', {
      kind: 'steps',
      name: 'exec',
      output: 'log',
    });

    expect(ids(moved)).toEqual(['exec', 'run', 'check']);
    expect(moved).toContain('# compile and run once');
  });

  it('removes a step with every wire from it, and undoing is the text before', () => {
    const removed = removeStep(COMMENTED, 0);

    expect(ids(removed)).toEqual(['check']);
    expect(workflowOf(removed).steps[0]?.with.actual).toBeUndefined();
    expect(workflowOf(removed).outputs).toEqual([]);
    expect(workflowOf(removed).steps[0]?.with.expected).toBeDefined();
  });

  it('renames a step and an input, every reference following', () => {
    const step = renameStep(COMMENTED, 0, 'solution');
    const input = renameInput(COMMENTED, 'time_limit', 'limit');
    const file = renameInput(COMMENTED, 'input', 'given');

    expect(step).toContain('actual: ${{ steps.solution.output }}');
    expect(step).toContain('log: ${{ steps.solution.log }}');
    expect(input).toContain('limit: number');
    expect(input).toContain('args: "--limit ${{ inputs.limit }}"');
    expect(input).toContain('time_limit: ${{ inputs.limit }}');
    expect(file).toContain('given: file');
    expect(file).toContain('stdin: ${{ inputs.given }}');
  });

  it('declares inputs in the short form when only the type is given', () => {
    const declared = setInput(COMMENTED, 'language', {
      type: 'enum',
      options: ['c', 'cpp'],
    });
    const optional = setInput(COMMENTED, 'key', { type: 'text', optional: true });
    const plain = setInput(COMMENTED, 'episodes', { type: 'number', optional: false });

    expect(declared).toContain('language: {type: enum, options: [c, cpp]}');
    expect(optional).toContain('key: {type: text, optional: true}');
    expect(plain).toContain('episodes: number');
    expect(declared).toContain('# what they send');
  });

  it('names an input for the task’s form, keeping how its declaration is written', () => {
    const block = [
      'inputs:',
      '  memory_limit:',
      '    type: number',
      '    title: Memory limit # the form shows it',
      '    unit: MB',
      'steps: []',
      '',
    ].join('\n');

    const helped = setInput(block, 'memory_limit', {
      type: 'number',
      title: 'Memory limit',
      unit: 'MB',
      help: 'The memory the program may use.',
    });
    expect(helped).toContain(
      [
        '  memory_limit:',
        '    type: number',
        '    title: Memory limit # the form shows it',
        '    unit: MB',
        '    help: The memory the program may use.',
      ].join('\n'),
    );
    const plain = setInput(helped, 'memory_limit', {
      type: 'number',
      title: '',
      unit: null,
      help: 'The memory the program may use.',
    });
    expect(workflowOf(plain).inputs[0]).toMatchObject({
      title: null,
      unit: null,
      help: 'The memory the program may use.',
    });
    const short = setInput(COMMENTED, 'time_limit', {
      type: 'number',
      title: 'Time limit',
    });
    expect(short).toContain('time_limit: {type: number, title: Time limit}');
  });

  it('removes an input with every port reading it', () => {
    const removed = removeInput(COMMENTED, 'time_limit');

    const runStep = workflowOf(removed).steps[0];
    expect(runStep?.with.args).toBeUndefined();
    expect(runStep?.with.time_limit).toBeUndefined();
    expect(workflowOf(removed).inputs.map((each) => each.id)).toEqual([
      'submission',
      'input',
      'answer',
    ]);
  });

  it('writes what the workflow does first, its comments kept, and removes it when nothing is said', () => {
    const said = setDescription(COMMENTED, '  Runs it once.  ');
    const twice = setDescription(said, 'Compiles it.\nThen runs it once.');

    expect(said.startsWith('description: Runs it once.\n')).toBe(true);
    expect(said).toContain('# A workflow with its notes kept.');
    expect(workflowOf(twice).description).toBe('Compiles it.\nThen runs it once.');
    expect(workflowOf(twice).steps).toEqual(workflowOf(COMMENTED).steps);
    expect(setDescription(twice, '   ')).not.toContain('description');
    expect(workflowOf(COMMENTED).description).toBeNull();
  });

  it('writes an output short, or with what its number means', () => {
    const short = setEntry(COMMENTED, 'time', {
      from: { kind: 'steps', name: 'run', output: 'time_ms' },
    });
    const meant = setEntry(COMMENTED, 'time', {
      from: { kind: 'steps', name: 'run', output: 'time_ms' },
      title: 'Run time',
      unit: 'ms',
    });

    expect(short).toContain('time: ${{ steps.run.time_ms }}');
    expect(meant).toContain(
      'time: {from: "${{ steps.run.time_ms }}", title: Run time, unit: ms}',
    );
    expect(
      workflowOf(removeEntry(meant, 'time')).outputs.map((entry) => entry.name),
    ).toEqual(['log']);
  });

  it('writes an output with a title as a mapping, and short again once it has none (M58)', () => {
    const log = workflowOf(COMMENTED).outputs.find((entry) => entry.name === 'log')!;
    const from = log.from!;
    const titled = setEntry(
      COMMENTED,
      'log',
      entryFields(log, 'text', { from, title: 'Compile log', unit: 'lines' }),
    );

    expect(titled).toContain(`log: {from: "${refText(from)}", title: Compile log}`);
    const titledLog = workflowOf(titled).outputs.find((entry) => entry.name === 'log')!;
    expect(titledLog).toMatchObject({ title: 'Compile log', unit: null, short: false });
    const plain = setEntry(
      titled,
      'log',
      entryFields(titledLog, 'text', { from, title: null }),
    );
    expect(plain).toContain(`log: ${refText(from)}`);
    expect(workflowOf(plain).outputs[0]).toMatchObject({ title: null, short: true });
  });

  it('keeps an output’s unit while it reads a number, or what it reads is not known', () => {
    const entry = {
      ...workflowOf(COMMENTED).outputs.find((found) => found.name === 'log')!,
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

  it('builds classic from an empty file', () => {
    let text = '';
    text = addStep(text, exec!);
    text = addStep(text, diff!);
    text = setInput(text, 'submission', { type: 'file' });
    text = setInput(text, 'input', { type: 'file' });
    text = wire(text, 0, 'source', { kind: 'inputs', name: 'submission' });
    text = wire(text, 0, 'stdin', { kind: 'inputs', name: 'input' });
    text = wire(text, 1, 'actual', {
      kind: 'steps',
      name: 'exec',
      output: 'output',
    });
    text = setEntry(text, 'time_ms', {
      from: { kind: 'steps', name: 'exec', output: 'time_ms' },
    });

    expect(text.indexOf('inputs:')).toBeLessThan(text.indexOf('steps:'));
    expect(text.indexOf('steps:')).toBeLessThan(text.indexOf('outputs:'));
    expect(ids(text)).toEqual(['exec', 'diff-check']);
    expect(workflowOf(text).inputs.map((input) => input.id)).toEqual(
      workflowOf(CLASSIC)
        .inputs.map((input) => input.id)
        .filter((id) => id === 'submission' || id === 'input'),
    );
  });

  it('reads a named set of files and a step output with a dotted name', () => {
    const text = [
      'steps:',
      '  - id: compare',
      '    use: unicon/exec@v2',
      '    with:',
      '      source: ${{ workflow.diff/ }}',
      '      manifest: ${{ workflow.diff/program.yaml }}',
      '      files:',
      '        output: ${{ steps.solution.output }}',
      '        answer: ${{ inputs.answer }}',
      'outputs:',
      '  time_ms: {from: "${{ steps.game.entrant.time_ms }}", title: Run time, unit: ms}',
      '',
    ].join('\n');
    const workflow = workflowOf(text);
    const files = workflow.steps[0]?.with.files;
    expect(files?.kind).toBe('mapping');
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
    const from = workflow.outputs[0]?.from ?? null;
    if (from === null) throw new Error('the output has no source');
    const edited = setEntry(text, 'time_ms', { from, title: 'Run time', unit: 'ms' });
    expect(edited).toContain('output: ${{ steps.solution.output }}');
    expect(edited).toContain('manifest: ${{ workflow.diff/program.yaml }}');
  });
});

it('writes a workflow-owned folder wire and keeps its comments', () => {
  const text = wire(COMMENTED, 0, 'source', { kind: 'workflow', name: 'checker/' });
  expect(text).toContain('source: ${{ workflow.checker/ }}');
  expect(text).toContain('# compile and run once');
  expect(workflowOf(text).steps[0]?.with.source).toEqual({
    kind: 'wire',
    ref: { kind: 'workflow', name: 'checker/' },
  });
});

describe('an input given by the workflow, and a file given by the task', () => {
  const READS = `inputs:
  answer: {type: file, title: Answer}  # the expected output
  input: file
steps:
  - id: check
    use: unicon/exec@v2
    with:
      stdin: \${{ inputs.input }}
      files:
        answer: \${{ inputs.answer }}
      args: "--answer \${{ inputs.answer }}"
`;

  it('makes every reader of an input read the file instead, and drops the input', () => {
    const given = inputToFile(READS, 'answer', 'data/answer.txt');

    expect(given).not.toContain('answer: {type: file');
    expect(given).toContain('answer: ${{ workflow.data/answer.txt }}');
    expect(given).toContain('args: "--answer ${{ workflow.data/answer.txt }}"');
    expect(given).toContain('stdin: ${{ inputs.input }}');
    expect(workflowOf(given).inputs.map((input) => input.id)).toEqual(['input']);
  });

  it('makes a file an input again, read wherever the file was', () => {
    const back = fileToInput(
      inputToFile(READS, 'answer', 'data/answer.txt'),
      'data/answer.txt',
      'answer',
      'file',
    );

    expect(workflowOf(back).inputs.find((input) => input.id === 'answer')?.type).toBe(
      'file',
    );
    expect(back).toContain('answer: ${{ inputs.answer }}');
    expect(back).not.toContain('workflow.');
  });

  it('declares the first input of a workflow that had none', () => {
    const text =
      'steps:\n  - {id: diff, use: unicon/exec@v2, with: {source: "${{ workflow.diff/ }}"}}\n';
    const back = fileToInput(text, 'diff/', 'diff', 'folder');

    expect(workflowOf(back).inputs).toMatchObject([{ id: 'diff', type: 'folder' }]);
    expect(back).toContain('${{ inputs.diff }}');
  });

  it('moves the readers of one file to another, and no other reference', () => {
    const text = inputToFile(READS, 'answer', 'a.txt').replace(
      'stdin: ${{ inputs.input }}',
      'stdin: ${{ workflow.a.txt.bak }}',
    );
    const moved = moveFile(text, 'a.txt', 'b.txt');

    expect(moved).toContain('answer: ${{ workflow.b.txt }}');
    expect(moved).toContain('stdin: ${{ workflow.a.txt.bak }}');
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
