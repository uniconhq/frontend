import { describe, expect, it } from 'vitest';
import type { GradingResult, Submission } from '@/api/types';
import { justFinished, pointsLine, pollEvery, verdictOf } from './grading';
import { formatExact } from '@/lib/exact';
import { formatWhen } from '@/lib/time';

const NOW = new Date('2026-09-26T10:10:00Z');

const done: GradingResult = {
  id: 'g',
  attempt: 1,
  status: 'graded',
  stopped: null,
  outcome: null,
  groups: [],
  values: { numbers: {}, texts: {} },
  reason: null,
  points: null,
  factor: null,
  folded: {},
};

function submitted(secondsAgo: number, status: 'grading' | 'graded'): Submission {
  return {
    number: 1,
    submitted_at: new Date(NOW.getTime() - secondsAgo * 1000).toISOString(),
    late_days: 0,
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

  it('is once a minute when nothing is being graded', () => {
    expect(pollEvery([submitted(3, 'graded')], NOW)).toBe(60_000);
    expect(pollEvery(undefined, NOW)).toBe(60_000);
  });
});

describe('the verdict a grading shows', () => {
  it('is where the grading stands until it is done', () => {
    expect(verdictOf({ ...done, status: 'grading', outcome: 'accepted' })).toBe(
      'grading',
    );
  });

  it('is what stopped the run, else the outcome, else that it is graded', () => {
    expect(verdictOf({ ...done, stopped: 'compile_error', outcome: 'accepted' })).toBe(
      'compile_error',
    );
    expect(verdictOf({ ...done, outcome: 'wrong_answer' })).toBe('wrong_answer');
    expect(verdictOf(done)).toBe('graded');
  });
});

describe('a submission’s points in its row', () => {
  const points = (shown: string, pendingUntil: string | null = null) => ({
    ...done,
    points: {
      shown,
      pending: pendingUntil === null ? '0' : '30',
      pending_until: pendingUntil,
    },
  });

  it('gives the points shown, exactly as served', () => {
    expect(pointsLine(points('75'), NOW)).toBe('75');
    expect(pointsLine(points('82.5'), NOW)).toBe(formatExact('82.5', 2));
  });

  it('gives a dash while it is graded, and when it never will be', () => {
    expect(pointsLine(null, NOW)).toBe('—');
    expect(pointsLine({ ...done, status: 'queued' }, NOW)).toBe('—');
    expect(pointsLine({ ...done, status: 'grading' }, NOW)).toBe('—');
    expect(pointsLine({ ...done, status: 'cancelled' }, NOW)).toBe('—');
    expect(pointsLine(done, NOW)).toBe('—');
  });

  it('says when points held back are shown', () => {
    const at = '2026-09-26T14:00:00Z';
    const when = formatWhen(new Date(at), NOW);
    expect(pointsLine(points('0', at), NOW)).toBe(`shown at ${when}`);
    expect(pointsLine(points('40', at), NOW)).toBe(`40 so far, more shown at ${when}`);
  });
});
