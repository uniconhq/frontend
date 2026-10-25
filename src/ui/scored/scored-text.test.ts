import { describe, expect, it } from 'vitest';
import { overLimitSentence, submissionsWords, tupleLine } from './scored-text';

describe('a run’s rows', () => {
  it('joins titles, and names a row with none from its key', () => {
    expect(tupleLine(['Big grid', null], { grid: 'big.txt', seed: 2 })).toBe(
      'Big grid · seed 2',
    );
    expect(tupleLine(null, { route: 'hidden/route.txt', seed: 2 })).toBe(
      'route.txt · seed 2',
    );
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
