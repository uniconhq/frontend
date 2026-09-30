import { describe, expect, it } from 'vitest';
import { contestantInput } from '@/test/contestant';
import {
  checkDraft,
  emptyDraft,
  htmlAccept,
  isPanelInput,
  submittedInputs,
  type Draft,
  type PanelInput,
} from './draft';

const MB = 1024 * 1024;

function panel(...inputs: ReturnType<typeof contestantInput>[]): PanelInput[] {
  return inputs.filter(isPanelInput);
}

function file(name: string, size: number, type = ''): File {
  return new File([new Uint8Array(size)], name, { type });
}

const code = contestantInput();
const weights = contestantInput({
  id: 'weights',
  type: 'file[]',
  label: 'Weights',
  language: null,
  accept: ['.bin', 'image/*'],
  max_size: MB,
});
const alpha = contestantInput({
  id: 'alpha',
  type: 'number',
  label: 'Alpha',
  language: null,
  min: 0,
  max: 1,
});

describe('the panel inputs', () => {
  it('leaves out what is not submitted from the browser', () => {
    const inputs = [
      code,
      contestantInput({ id: 'book', type: 'jupyter', language: null }),
      contestantInput({ id: 'data', type: 'dataset', language: null }),
    ];
    expect(panel(...inputs).map((input) => input.id)).toEqual(['submission']);
  });

  it('starts each input empty or at its default', () => {
    const draft = emptyDraft(
      panel(
        code,
        contestantInput({ id: 'two', language: ['c', 'cpp'] }),
        contestantInput({ id: 'alpha', type: 'number', language: null, default: 0.5 }),
        contestantInput({ id: 'fast', type: 'boolean', language: null, default: true }),
      ),
    );
    expect(draft).toEqual({
      submission: { kind: 'files', files: [], language: 'python' },
      two: { kind: 'files', files: [], language: '' },
      alpha: { kind: 'text', text: '0.5' },
      fast: { kind: 'flag', checked: true },
    });
  });
});

describe('the accept attribute', () => {
  it('writes a bare ending with its dot and keeps content types', () => {
    expect(htmlAccept(contestantInput({ accept: ['py', '.txt', 'image/*'] }))).toBe(
      '.py,.txt,image/*',
    );
    expect(htmlAccept(code)).toBeUndefined();
  });
});

describe('the checks before anything is sent', () => {
  const inputs = panel(code, weights, alpha);
  const full: Draft = {
    submission: { kind: 'files', files: [file('main.py', 10)], language: 'python' },
    weights: {
      kind: 'files',
      files: [file('model.bin', 10), file('x.png', 5, 'image/png')],
      language: '',
    },
    alpha: { kind: 'text', text: '0.25' },
  };

  it('passes a draft that fits', () => {
    expect(checkDraft(inputs, full, 10 * MB)).toBeNull();
  });

  it('names every input that is empty, refused or out of range', () => {
    const refused = checkDraft(
      inputs,
      {
        submission: { kind: 'files', files: [], language: 'python' },
        weights: { kind: 'files', files: [file('notes.txt', 1)], language: '' },
        alpha: { kind: 'text', text: '2' },
      },
      10 * MB,
    );
    expect(refused?.code).toBe('invalid_inputs');
    expect(refused?.extensions['errors']).toEqual([
      { input: 'submission', message: 'This input needs a file.' },
      {
        input: 'weights',
        message: 'notes.txt is not a file this input takes: .bin, image/*.',
      },
      { input: 'alpha', message: 'Must be at most 1.' },
    ]);
  });

  it('asks for a number and a language', () => {
    const refused = checkDraft(
      panel(contestantInput({ language: ['c', 'cpp'] }), alpha),
      {
        submission: { kind: 'files', files: [file('a.c', 1)], language: '' },
        alpha: { kind: 'text', text: ' ' },
      },
      MB,
    );
    expect(refused?.extensions['errors']).toEqual([
      { input: 'submission', message: 'Choose a language.' },
      { input: 'alpha', message: 'Give a number.' },
    ]);
  });

  it('holds a file to its input’s size, naming the input', () => {
    const refused = checkDraft(
      inputs,
      {
        ...full,
        weights: { kind: 'files', files: [file('big.bin', MB + 1)], language: '' },
      },
      10 * MB,
    );
    expect(refused?.code).toBe('too_large');
    expect(refused?.extensions).toEqual({ limit: MB, input: 'weights' });
  });

  it('holds a file to the task’s size when that is the smaller', () => {
    const refused = checkDraft(inputs, full, 8);
    expect(refused?.extensions).toEqual({ limit: 8, input: null });
  });

  it('holds the files together to the task’s size', () => {
    const refused = checkDraft(inputs, full, 20);
    expect(refused?.code).toBe('too_large');
    expect(refused?.extensions).toEqual({ limit: 20, input: null });
  });
});

describe('what a submit sends', () => {
  it('names the uploads and the language, or the value', () => {
    const main = file('main.py', 1);
    const inputs = panel(
      code,
      contestantInput({ id: 'data', type: 'file', language: null }),
      alpha,
      contestantInput({ id: 'fast', type: 'boolean', language: null }),
      contestantInput({ id: 'notes', type: 'text', language: null }),
    );
    const data = file('in.txt', 1);
    const sent = submittedInputs(
      inputs,
      {
        submission: { kind: 'files', files: [main], language: 'python' },
        data: { kind: 'files', files: [data], language: '' },
        alpha: { kind: 'text', text: ' 0.5 ' },
        fast: { kind: 'flag', checked: false },
        notes: { kind: 'text', text: 'hello' },
      },
      (input, chosen) => `${input}:${chosen === main ? 'u-main' : 'u-data'}`,
    );
    expect(sent).toEqual({
      submission: { uploads: ['submission:u-main'], language: 'python' },
      data: { uploads: ['data:u-data'], language: null },
      alpha: { uploads: [], value: 0.5 },
      fast: { uploads: [], value: false },
      notes: { uploads: [], value: 'hello' },
    });
  });
});
