import { describe, expect, it } from 'vitest';
import type { DeclaredField } from '@/api/types';
import { matchFiles, type Source } from './match';

const CLASSIC: DeclaredField[] = [
  { name: 'input', type: 'file', options: null },
  { name: 'answer', type: 'file', options: null },
];

function sources(...paths: string[]): Source[] {
  return paths.map((path) => ({
    path,
    size: path.length,
    read: () => Promise.resolve(new Blob([path])),
  }));
}

/** Each test as `group/test: field=entry, ...`, for reading at a glance. */
function shown(paths: string[], fields = CLASSIC) {
  const { tests, unmatched } = matchFiles(sources(...paths), fields);
  return {
    tests: tests.map(
      (test) =>
        `${test.group ?? '?'}/${test.test}: ${test.files
          .map((file) => `${file.field}=${file.entry}`)
          .join(
            ', ',
          )}${test.problems.length > 0 ? ` (${test.problems.join(' ')})` : ''}`,
    ),
    unmatched: unmatched.map((file) => file.path),
  };
}

describe('matching files to tests', () => {
  it('pairs files by name, each ending naming the part of a test it is', () => {
    expect(shown(['1.in', '1.out', '2.in', '2.ans', '10.in', '10.out'])).toEqual({
      tests: [
        '?/1: input=input, answer=answer',
        '?/2: input=input, answer=answer',
        '?/10: input=input, answer=answer',
      ],
      unmatched: [],
    });
  });

  it('keeps an ending after the field’s name, and says what is missing', () => {
    expect(shown(['a.input.txt', 'a.answer.txt', 'b.in'])).toEqual({
      tests: [
        '?/a: input=input.txt, answer=answer.txt',
        '?/b: input=input (It has no answer.)',
      ],
      unmatched: [],
    });
  });

  it('reads a zip’s folders as groups and tests, under a folder named tests or not', () => {
    expect(
      shown([
        'task/tests/small/1/input',
        'task/tests/small/1/answer.txt',
        'large/7.in',
        'large/7.out',
        '3/input',
        '3/answer',
        '3/test.yaml',
        '.DS_Store',
      ]),
    ).toEqual({
      tests: [
        '?/3: input=input, answer=answer, test.yaml=test.yaml',
        'large/7: input=input, answer=answer',
        'small/1: input=input, answer=answer.txt',
      ],
      unmatched: ['.DS_Store'],
    });
  });

  it('lists the files it leaves out, hidden ones and those outside their folder, with why', () => {
    const { unmatched } = matchFiles(
      sources('.DS_Store', 'small/.git/config', '../1.in', 'small/../2.in'),
      CLASSIC,
    );
    expect(unmatched.map((file) => [file.path, file.reason])).toEqual([
      ['.DS_Store', 'It is a hidden file, so it is left out.'],
      ['small/.git/config', 'It is a hidden file, so it is left out.'],
      ['../1.in', 'Its path leads out of its folder, so it is left out.'],
      ['small/../2.in', 'Its path leads out of its folder, so it is left out.'],
    ]);
  });

  it('says when a test has two files at one place, such as two of its test.yaml', () => {
    expect(
      shown([
        'small/1/input',
        'small/1/answer',
        'small/1/test.yaml',
        'small/1/test.yaml',
      ]).tests,
    ).toEqual([
      'small/1: input=input, answer=answer, test.yaml=test.yaml, test.yaml=test.yaml (It has 2 files at test.yaml.)',
    ]);
  });

  it('says why a file fits no test', () => {
    const { unmatched } = matchFiles(
      sources('notes.txt', '1.png', 'a b.in', 'x/y/z/w.in'),
      CLASSIC,
    );
    expect(unmatched.map((file) => [file.path, file.reason])).toEqual([
      [
        'notes.txt',
        'Its ending “.txt” names no part of a test: a test has input, answer.',
      ],
      ['1.png', 'Its ending “.png” names no part of a test: a test has input, answer.'],
      ['a b.in', 'A test’s and a group’s name may hold only letters, digits, _ and -.'],
      ['x/y/z/w.in', 'It is in a folder that is not a test group or a test.'],
    ]);
  });

  it('fills a folder field from the files under it', () => {
    const fields: DeclaredField[] = [
      { name: 'data', type: 'folder', options: null },
      { name: 'answer', type: 'file', options: null },
    ];
    expect(shown(['1/data/a.csv', '1/data/b.csv', '1/answer.csv'], fields)).toEqual({
      tests: ['?/1: data=data/a.csv, data=data/b.csv, answer=answer.csv'],
      unmatched: [],
    });
  });
});
