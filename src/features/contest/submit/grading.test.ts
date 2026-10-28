import { describe, expect, it } from 'vitest';
import type { GradingResult, Submission } from '@/api/types';
import { justFinished, pollEvery, resultLine } from './grading';

const NOW = new Date('2026-09-26T10:10:00Z');

const done: GradingResult = {
  id: 'g',
  attempt: 1,
  status: 'graded',
  reason: null,
  limit: null,
  compiled: null,
  once: { reports: {}, texts: {} },
  reveal_at: null,
  run_values: [],
  runs: [],
};

function submitted(secondsAgo: number, status: 'grading' | 'graded'): Submission {
  return {
    number: 1,
    submitted_at: new Date(NOW.getTime() - secondsAgo * 1000).toISOString(),
    grading: { ...done, status },
  };
}

describe('how often submissions are read again', () => {
  it('is every two seconds just after a submit and less often the longer it waits', () => {
    expect(pollEvery(submitted(5, 'grading'), NOW)).toBe(2_000);
    expect(pollEvery(submitted(45, 'grading'), NOW)).toBe(5_000);
    expect(pollEvery(submitted(600, 'grading'), NOW)).toBe(15_000);
  });

  it('follows closely a submission stamped after the clock it is read by', () => {
    expect(pollEvery(submitted(-1, 'grading'), NOW)).toBe(2_000);
  });

  it('follows the newest submission still being graded', () => {
    expect(pollEvery([submitted(600, 'grading'), submitted(3, 'grading')], NOW)).toBe(
      2_000,
    );
  });

  it('waits at least five seconds while the live stream is refused', () => {
    expect(pollEvery(submitted(5, 'grading'), NOW, false, true)).toBe(5_000);
    expect(pollEvery(submitted(600, 'grading'), NOW, false, true)).toBe(15_000);
    expect(pollEvery([submitted(3, 'graded')], NOW, false, true)).toBe(60_000);
  });

  it('does not follow a cancelled grading, which is finished', () => {
    const cancelled: Submission = {
      ...submitted(3, 'grading'),
      grading: { ...done, status: 'cancelled', reason: 'The checker crashed.' },
    };
    expect(pollEvery([cancelled], NOW)).toBe(60_000);
    expect(
      justFinished([submitted(3, 'grading')], [cancelled]).map((found) => found.number),
    ).toEqual([1]);
  });

  it('follows a delayed grading, which Unicon tries again by itself, and says when it is graded', () => {
    const delayed: Submission = {
      ...submitted(600, 'grading'),
      grading: { ...done, status: 'delayed' },
    };
    expect(pollEvery([delayed], NOW)).toBe(15_000);
    expect(
      justFinished([submitted(600, 'grading')], [delayed]).map((found) => found.number),
    ).toEqual([]);
    expect(
      justFinished([delayed], [submitted(600, 'graded')]).map((found) => found.number),
    ).toEqual([1]);
  });

  it('reads again when the task reveals, even while the live stream is open', () => {
    const held: Submission = {
      ...submitted(3, 'graded'),
      grading: {
        ...done,
        reveal_at: new Date(NOW.getTime() + 5_000).toISOString(),
      },
    };
    expect(pollEvery(held, NOW, true)).toBe(5_000);
    expect(pollEvery(held, NOW)).toBe(5_000);
  });

  it('is once a minute when nothing is being graded', () => {
    expect(pollEvery([submitted(3, 'graded')], NOW)).toBe(60_000);
    expect(pollEvery(undefined, NOW)).toBe(60_000);
  });
});

describe('what a submission came to, in its row', () => {
  const run = {
    group: 'all',
    place: 1,
    id: null,
    dropped: false,
    tuples: [],
    verdict: 'accepted' as const,
    passed: 1,
    reports: [],
    texts: {},
    label: null,
    message: null,
  };
  const value = {
    name: 'score',
    number: null,
    text: null,
    waiting: false,
    self_reported: false,
    show: null,
    facts: null,
    runs: null,
    values: null,
  };

  it('is nothing with no grading or nothing of it shown', () => {
    expect(resultLine(null)).toBe('');
    expect(resultLine(done)).toBe('');
  });

  it('says it did not compile before anything else', () => {
    expect(resultLine({ ...done, compiled: 0, runs: [run] })).toBe('Did not compile');
  });

  it('says each value it is shown, by name', () => {
    expect(
      resultLine({
        ...done,
        compiled: 1,
        runs: [run],
        run_values: [
          { ...value, number: '7' },
          { ...value, name: 'note', text: 'fast' },
          { ...value, name: 'style', waiting: true },
          { ...value, name: 'bonus' },
        ],
      }),
    ).toBe('score: 7 · note: fast · style: being checked · bonus: –');
  });

  it('says how many of its tests passed when it is shown no value', () => {
    expect(
      resultLine({
        ...done,
        runs: [run, { ...run, place: 2, verdict: 'wrong_answer', passed: 0 }],
      }),
    ).toBe('Passed 1 of 2 tests');
    expect(resultLine({ ...done, runs: [run] })).toBe('Passed 1 of 1 test');
  });
});
