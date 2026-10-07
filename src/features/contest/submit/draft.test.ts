import { describe, expect, it } from 'vitest';
import { inputField, languageField } from '@/test/contestant';
import { checkDraft, emptyDraft, pathOf, submittedInputs, type Draft } from './draft';

const MB = 1024 * 1024;

function file(name: string, size: number, type = ''): File {
  return new File([new Uint8Array(size)], name, { type });
}

/** A file as a folder picker gives it: with its path inside the folder chosen. */
function inFolder(path: string, size = 1): File {
  const found = file(path.slice(path.lastIndexOf('/') + 1), size);
  Object.defineProperty(found, 'webkitRelativePath', { value: path });
  return found;
}

const solution = inputField();
const program = inputField({
  id: 'program',
  type: 'folder',
  label: 'Your program',
  max_size: 20,
});
const answers = inputField({
  id: 'answers',
  type: 'file',
  label: 'Your answers',
  per_test: true,
});
const alpha = inputField({
  id: 'alpha',
  type: 'number',
  label: 'Alpha',
  min: 0,
  max: 1,
});
const language = inputField({
  id: 'language',
  type: 'enum',
  label: 'Language',
  options: ['c', 'cpp'],
});

describe('the panel inputs', () => {
  it('starts each input empty or at its default', () => {
    const draft = emptyDraft([
      solution,
      program,
      language,
      inputField({ id: 'level', type: 'enum', options: ['a', 'b'], default: 'b' }),
      inputField({ id: 'alpha', type: 'number', default: 0.5 }),
      inputField({ id: 'fast', type: 'boolean', default: true }),
    ]);
    expect(draft).toEqual({
      submission: { kind: 'files', files: [] },
      program: { kind: 'files', files: [] },
      language: { kind: 'choice', option: '' },
      level: { kind: 'choice', option: 'b' },
      alpha: { kind: 'text', text: '0.5' },
      fast: { kind: 'flag', checked: true },
    });
    expect(emptyDraft([languageField])).toEqual({
      language: { kind: 'choice', option: 'python' },
    });
  });
});

describe('where each file goes under its input', () => {
  it('keeps a folder’s layout, the chosen folder’s own name left off', () => {
    expect(pathOf(program, inFolder('mine/src/Main.java'))).toBe('src/Main.java');
    expect(pathOf(program, file('Main.java', 1))).toBe('Main.java');
  });

  it('names a file per test by where it sits, or by its name as given', () => {
    expect(pathOf(answers, inFolder('out/main/1.txt'))).toBe('main/1.txt');
    expect(pathOf(answers, file('1.txt', 1))).toBe('1.txt');
  });

  it('names the one file of a file input by its name', () => {
    expect(pathOf(solution, inFolder('mine/main.py'))).toBe('main.py');
  });
});

describe('the checks before anything is sent', () => {
  const inputs = [solution, program, alpha, language];
  const full: Draft = {
    submission: { kind: 'files', files: [file('main.py', 10)] },
    program: { kind: 'files', files: [inFolder('p/a.c', 5), inFolder('p/b/c.h', 5)] },
    alpha: { kind: 'text', text: '0.25' },
    language: { kind: 'choice', option: 'cpp' },
  };

  it('passes a draft that fits', () => {
    expect(checkDraft(inputs, full)).toBeNull();
  });

  it('names every input that is empty, unchosen or out of range', () => {
    const refused = checkDraft(inputs, {
      submission: { kind: 'files', files: [] },
      program: { kind: 'files', files: [] },
      alpha: { kind: 'text', text: '2' },
      language: { kind: 'choice', option: '' },
    });
    expect(refused?.code).toBe('invalid_inputs');
    expect(refused?.extensions['errors']).toEqual([
      { input: 'submission', message: 'This input needs a file.' },
      { input: 'program', message: 'This input needs at least one file.' },
      { input: 'alpha', message: 'Must be at most 1.' },
      { input: 'language', message: 'Choose one of c, cpp.' },
    ]);
  });

  it('asks for a number', () => {
    const refused = checkDraft([alpha], { alpha: { kind: 'text', text: ' ' } });
    expect(refused?.extensions['errors']).toEqual([
      { input: 'alpha', message: 'Give a number.' },
    ]);
  });

  it('holds an input’s files together to its size, naming the input', () => {
    const refused = checkDraft(inputs, {
      ...full,
      program: {
        kind: 'files',
        files: [inFolder('p/a.c', 15), inFolder('p/b.c', 6)],
      },
    });
    expect(refused?.code).toBe('too_large');
    expect(refused?.extensions).toEqual({ limit: 20, input: 'program' });
  });

  it('holds one file to its input’s size', () => {
    const refused = checkDraft([inputField({ max_size: MB })], {
      submission: { kind: 'files', files: [file('big.py', MB + 1)] },
    });
    expect(refused?.extensions).toEqual({ limit: MB, input: 'submission' });
  });
});

describe('what a submit sends', () => {
  it('names the uploads of each file input, or the value', () => {
    const main = file('main.py', 1);
    const header = inFolder('p/b/c.h');
    const sent = submittedInputs(
      [
        solution,
        program,
        alpha,
        languageField,
        inputField({ id: 'fast', type: 'boolean' }),
        inputField({ id: 'notes', type: 'text' }),
      ],
      {
        submission: { kind: 'files', files: [main] },
        program: { kind: 'files', files: [header] },
        alpha: { kind: 'text', text: ' 0.5 ' },
        language: { kind: 'choice', option: 'python' },
        fast: { kind: 'flag', checked: false },
        notes: { kind: 'text', text: 'hello' },
      },
      (input, chosen) => `${input}:${chosen === main ? 'u-main' : 'u-header'}`,
    );
    expect(sent).toEqual({
      submission: { uploads: ['submission:u-main'] },
      program: { uploads: ['program:u-header'] },
      alpha: { uploads: [], value: 0.5 },
      language: { uploads: [], value: 'python' },
      fast: { uploads: [], value: false },
      notes: { uploads: [], value: 'hello' },
    });
  });
});
