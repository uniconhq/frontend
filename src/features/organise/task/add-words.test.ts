import { describe, expect, it } from 'vitest';
import type { DeclaredField } from '@/api/types';
import { namingSentences, pairedRefusal, waysOf, zipFolders } from './add-words';
import { namingOf } from './match';

const field = (name: string, type = 'file'): DeclaredField => ({
  name,
  type,
  options: null,
});

const CLASSIC = namingOf([field('input'), field('answer')]);

describe('what Add tests says of a task’s parts (M47)', () => {
  it('names the classic parts, their usual endings and the others taken', () => {
    expect(CLASSIC).toEqual([
      { name: 'input', folder: false, ending: 'in', also: ['inp', 'input'] },
      {
        name: 'answer',
        folder: false,
        ending: 'out',
        also: ['ans', 'a', 'expected', 'answer'],
      },
    ]);
    expect(namingSentences(CLASSIC)).toEqual([
      'Each test needs an input and an answer.',
      "Name them like 1.in (test 1's input) and 1.out (test 1's answer).",
      'Also taken: .inp, .input; .ans, .a, .expected, .answer.',
    ]);
  });

  it('says what each way of adding asks for, with the task’s own parts', () => {
    expect(waysOf(CLASSIC)).toEqual({
      one: 'Pick its input and its answer.',
      paired: 'Drop pairs like 1.in and 1.out. Each number becomes one test.',
      zip: 'The same pairs in a zip, or a folder per test (1/input, 1/answer).',
    });
    expect(pairedRefusal(CLASSIC)).toBeNull();
  });

  it('takes a part with no usual ending by its own name, and three parts as sets', () => {
    const parts = namingOf([field('input'), field('output'), field('config')]);
    expect(namingSentences(parts)[1]).toBe(
      "Name them like 1.in (test 1's input), 1.out (test 1's output) and 1.config (test 1's config).",
    );
    expect(waysOf(parts).paired).toBe(
      'Drop sets like 1.in, 1.out and 1.config. Each number becomes one test.',
    );
  });

  it('says how a zip holds its groups with the task’s own first part', () => {
    expect(zipFolders(CLASSIC)).toBe(
      'A folder per test group holds its tests, such as small/1/input; files at the top go into the group chosen above.',
    );
    expect(zipFolders(namingOf([field('source'), field('expected')]))).toBe(
      'A folder per test group holds its tests, such as small/1/source; files at the top go into the group chosen above.',
    );
    expect(zipFolders([])).toBe(
      'A folder per test group holds its tests, such as small/1; files at the top go into the group chosen above.',
    );
  });

  it('says "a" before a part whose name sounds like "you", and "an" before another vowel', () => {
    const parts = namingOf([
      field('user_output'),
      field('unit_answer'),
      field('expected'),
      field('upper'),
    ]);
    expect(namingSentences(parts)[0]).toBe(
      'Each test needs a user_output, a unit_answer, an expected and an upper.',
    );
  });

  it('keeps a folder part to a zip, and says why files by name cannot hold it', () => {
    const parts = namingOf([field('input'), field('data', 'folder')]);
    expect(pairedRefusal(parts)).toBe(
      "A test's data is a folder, which only a zip can hold.",
    );
    expect(waysOf(parts).zip).toBe('A folder per test in a zip (1/input, 1/data).');
    expect(namingSentences(parts)[0]).toBe(
      'Each test needs an input and a data folder.',
    );
  });
});
