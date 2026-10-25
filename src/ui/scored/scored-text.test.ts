import { describe, expect, it } from 'vitest';
import { overLimitSentence, reportLabel, submissionsWords, tupleLine } from './scored-text';

describe('a run’s rows', () => {
  it('shows a titled tuple by its title and an untitled one by its columns', () => {
    expect(
      tupleLine([
        { title: 'Big grid', key: { grid: 'big.txt', answer: 'big.ans' } },
        { title: null, key: { seed: 2 } },
      ]),
    ).toBe('Big grid · seed 2');
    expect(tupleLine([{ title: null, key: { route: 'hidden/route.txt', seed: 2 } }])).toBe(
      'route.txt · seed 2',
    );
  });
});

describe('a shown output', () => {
  it('names it by its title, with its unit when it has one', () => {
    expect(reportLabel('Run time', 'ms')).toBe('Run time (ms)');
    expect(reportLabel('score', null)).toBe('score');
  });
});

describe('a submission over the task’s limit (#445)', () => {
  it('counts the limit in submissions, one or many', () => {
    expect(submissionsWords(1)).toBe('1 submission');
    expect(submissionsWords(10)).toBe('10 submissions');
  });

  it('says one sentence, to the entrant or of them, with the limit or without it', () => {
    expect(overLimitSentence('you', 10)).toBe(
      'Not graded: you had reached the limit of 10 submissions for this task.',
    );
    expect(overLimitSentence('the entrant', 1)).toBe(
      'Not graded: the entrant had reached the limit of 1 submission for this task.',
    );
    expect(overLimitSentence('the entrant', null)).toBe(
      'Not graded: the entrant had reached the limit of submissions for this task.',
    );
  });
});
