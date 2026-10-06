import { describe, expect, it } from 'vitest';
import type { GradingResult, Submission } from '@/api/types';
import { pollEvery, verdictOf } from './grading';

const NOW = new Date('2026-09-26T10:10:00Z');

const done: GradingResult = {
  id: 'g',
  attempt: 1,
  status: 'done',
  stopped: null,
  outcome: null,
  groups: [],
  values: {},
};

function submitted(secondsAgo: number, status: 'dispatched' | 'done'): Submission {
  return {
    number: 1,
    submitted_at: new Date(NOW.getTime() - secondsAgo * 1000).toISOString(),
    late_days: 0,
    grading: { ...done, status },
  };
}

describe('how often submissions are read again', () => {
  it('is every two seconds just after a submit and less often the longer it waits', () => {
    expect(pollEvery(submitted(5, 'dispatched'), NOW)).toBe(2_000);
    expect(pollEvery(submitted(45, 'dispatched'), NOW)).toBe(5_000);
    expect(pollEvery(submitted(600, 'dispatched'), NOW)).toBe(15_000);
  });

  it('follows the newest submission still being graded', () => {
    expect(
      pollEvery([submitted(600, 'dispatched'), submitted(3, 'dispatched')], NOW),
    ).toBe(2_000);
  });

  it('waits at least five seconds while the live stream is refused', () => {
    expect(pollEvery(submitted(5, 'dispatched'), NOW, false, true)).toBe(5_000);
    expect(pollEvery(submitted(600, 'dispatched'), NOW, false, true)).toBe(15_000);
    expect(pollEvery([submitted(3, 'done')], NOW, false, true)).toBe(60_000);
  });

  it('is once a minute when nothing is being graded', () => {
    expect(pollEvery([submitted(3, 'done')], NOW)).toBe(60_000);
    expect(pollEvery(undefined, NOW)).toBe(60_000);
  });
});

describe('the verdict a grading shows', () => {
  it('is where the grading stands until it is done', () => {
    expect(verdictOf({ ...done, status: 'running', outcome: 'accepted' })).toBe(
      'running',
    );
  });

  it('is what stopped the run, else the outcome, else that it is graded', () => {
    expect(verdictOf({ ...done, stopped: 'compile_error', outcome: 'accepted' })).toBe(
      'compile_error',
    );
    expect(verdictOf({ ...done, outcome: 'wrong_answer' })).toBe('wrong_answer');
    expect(verdictOf(done)).toBe('done');
  });
});
