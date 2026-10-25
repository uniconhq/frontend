import { describe, expect, it } from 'vitest';
import { inputField, languageField } from '@/test/contestant';
import {
  checkDraft,
  emptyDraft,
  pathOf,
  submittedInputs,
  uploadsOf,
  type Draft,
} from './draft';

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
/** A number of 30 significant digits, past what a float holds. */
const THIRTY = '0.123456789012345678901234567891';
const alpha = inputField({
  id: 'alpha',
  type: 'number',
  label: 'Alpha',
  min: '0',
  max: '1',
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
      inputField({ id: 'alpha', type: 'number', default: '0.5' }),
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
      { input: 'alpha', message: 'This must be at most 1.' },
      { input: 'language', message: 'Choose one of c, cpp.' },
    ]);
  });

  it('asks for a number', () => {
    const refused = checkDraft([alpha], { alpha: { kind: 'text', text: ' ' } });
    expect(refused?.extensions['errors']).toEqual([
      { input: 'alpha', message: 'Give a number in plain digits, such as 2.5.' },
    ]);
  });

  it('takes a number only as plain decimal digits', () => {
    for (const text of ['1e3', '0x10', 'NaN', '.5', '+1', '1 000']) {
      const refused = checkDraft([alpha], { alpha: { kind: 'text', text } });
      expect(refused?.extensions['errors'], text).toEqual([
        {
          input: 'alpha',
          message: 'Give a number in plain digits, such as 2.5.',
        },
      ]);
    }
  });

  it('checks a number against bounds of 30 digits exactly', () => {
    const ratio = inputField({ id: 'ratio', type: 'number', max: THIRTY });
    const at = checkDraft([ratio], { ratio: { kind: 'text', text: THIRTY } });
    const past = checkDraft([ratio], {
      ratio: { kind: 'text', text: `${THIRTY.slice(0, -1)}2` },
    });
    expect(at).toBeNull();
    expect(past?.extensions['errors']).toEqual([
      { input: 'ratio', message: `This must be at most ${THIRTY}.` },
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

  it('holds each part to its own size, and lets one part stay empty', () => {
    const route = inputField({
      id: 'route',
      parts: [
        { title: 'Small grid', max_size: 10 * MB },
        { title: null, max_size: 50 * MB },
      ],
    });
    const small = file('a.txt', 1);
    expect(
      checkDraft([route], {
        route: {
          kind: 'parts',
          parts: [
            { kind: 'files', files: [small] },
            { kind: 'files', files: [] },
          ],
        },
      }),
    ).toBeNull();
    expect(checkDraft([route], emptyDraft([route]))?.extensions['errors']).toEqual([
      { input: 'route', message: 'Give at least one part of this input.' },
    ]);
    expect(
      checkDraft([route], {
        route: {
          kind: 'parts',
          parts: [
            { kind: 'files', files: [small] },
            { kind: 'files', files: [file('b.txt', 50 * MB + 1)] },
          ],
        },
      })?.extensions,
    ).toEqual({ limit: 50 * MB, input: 'route', part: 2 });
  });

  it('holds one file to its input’s size', () => {
    const refused = checkDraft([inputField({ max_size: MB })], {
      submission: { kind: 'files', files: [file('big.py', MB + 1)] },
    });
    expect(refused?.extensions).toEqual({ limit: MB, input: 'submission' });
  });
});

describe('what a submit sends', () => {
  it('sends a number as the digits it was typed as', () => {
    const ratio = inputField({ id: 'ratio', type: 'number' });
    const sent = submittedInputs(
      [ratio],
      { ratio: { kind: 'text', text: ` ${THIRTY} ` } },
      () => '',
    );
    expect(sent).toEqual({ ratio: { uploads: [], value: THIRTY } });
  });

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
      alpha: { uploads: [], value: '0.5' },
      language: { uploads: [], value: 'python' },
      fast: { uploads: [], value: false },
      notes: { uploads: [], value: 'hello' },
    });
  });

  it('sends a per-row input as one part from 1, leaving out a part not given', () => {
    const route = inputField({
      id: 'route',
      parts: [
        { title: 'Small grid', max_size: MB },
        { title: 'Big grid', max_size: MB },
      ],
    });
    const small = file('a.txt', 1);
    expect(
      submittedInputs(
        [route],
        {
          route: {
            kind: 'parts',
            parts: [
              { kind: 'files', files: [small] },
              { kind: 'files', files: [] },
            ],
          },
        },
        () => 'up',
      ),
    ).toEqual({
      route: { uploads: [], parts: { '1': { uploads: ['up'] } } },
    });
  });

  it('gives each part of a number input its own value, checked as the input is', () => {
    const seed = inputField({
      id: 'seed',
      type: 'number',
      min: '0',
      max: '9',
      parts: [
        { title: 'Small grid', max_size: MB },
        { title: null, max_size: MB },
      ],
    });
    const draft = emptyDraft([seed]);
    expect(draft).toEqual({
      seed: {
        kind: 'parts',
        parts: [
          { kind: 'text', text: '' },
          { kind: 'text', text: '' },
        ],
      },
    });
    const typed: Draft = {
      seed: {
        kind: 'parts',
        parts: [
          { kind: 'text', text: ' 4 ' },
          { kind: 'text', text: '12' },
        ],
      },
    };
    expect(checkDraft([seed], typed)?.extensions['errors']).toEqual([
      { input: 'seed', message: 'Part 2: This must be at most 9.' },
    ]);
    const fixed: Draft = {
      seed: {
        kind: 'parts',
        parts: [
          { kind: 'text', text: ' 4 ' },
          { kind: 'text', text: '' },
        ],
      },
    };
    expect(checkDraft([seed], fixed)).toBeNull();
    expect(submittedInputs([seed], fixed, () => '')).toEqual({
      seed: { uploads: [], parts: { '1': { uploads: [], value: '4' } } },
    });
  });

  it('sends every file of a folder part, each at its path in the folder', () => {
    const tree = inputField({
      id: 'tree',
      type: 'folder',
      parts: [{ title: null, max_size: MB }],
    });
    const files = [inFolder('p/a.c'), inFolder('p/lib/b.h')];
    const draft: Draft = { tree: { kind: 'parts', parts: [{ kind: 'files', files }] } };
    const found = uploadsOf([tree], draft);
    expect(found.map((each) => [pathOf(each.input, each.file), each.part])).toEqual([
      ['a.c', 1],
      ['lib/b.h', 1],
    ]);
    expect(submittedInputs([tree], draft, (_, chosen) => chosen.name)).toEqual({
      tree: { uploads: [], parts: { '1': { uploads: ['a.c', 'b.h'] } } },
    });
  });
});
