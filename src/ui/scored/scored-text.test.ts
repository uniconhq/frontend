import { describe, expect, it } from 'vitest';
import { overLimitSentence, submissionsWords } from './scored-text';

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
