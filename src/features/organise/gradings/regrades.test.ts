import { describe, expect, it } from 'vitest';
import type { RegradeSummary } from '@/api/types';
import { formatExact } from '@/lib/exact';
import { formatDateTime } from '@/lib/time';
import {
  causeWords,
  decidingValues,
  runningWords,
  sideWords,
  summaryParts,
} from './regrades';

const counts = {
  up: 0,
  down: 0,
  stopped: 0,
  unchanged: 0,
  new: 0,
  running: 0,
  failed: 0,
  over_limit: 0,
};

function summary(more: Partial<RegradeSummary> = {}): RegradeSummary {
  return {
    id: '0199a2c1-0000-7000-8000-000000000001',
    task: 'sum',
    label: 'A',
    cause: 'rejudge',
    publication: 3,
    started_at: '2026-10-12T14:00:00Z',
    started_by: 7,
    started_by_name: 'alice',
    total: 120,
    graded: 120,
    running: false,
    counts: { ...counts, unchanged: 113, down: 4, stopped: 2, up: 1 },
    ...more,
  };
}

const words = (parts: { words: string }[]) => parts.map((part) => part.words);

describe("a regrade's summary", () => {
  it('reads as what it graded, what got worse, then what got better, leaving out a 0', () => {
    expect(words(summaryParts(summary(), ['compile_error', 'compile_error']))).toEqual([
      '120 graded',
      '4 went down',
      '2 now fail to compile',
      '1 went up',
    ]);
    expect(
      words(summaryParts(summary({ counts: { ...counts, unchanged: 120 } }))),
    ).toEqual(['120 graded']);
  });

  it('says what stopped a run before its tests in plain words, one or several', () => {
    const stopped = summary({ counts: { ...counts, stopped: 3 } });
    expect(
      words(summaryParts(stopped, ['compile_error', 'time_limit', 'time_limit'])),
    ).toEqual([
      '120 graded',
      '1 now fails to compile',
      '2 now run out of time before their tests',
    ]);
    // Before the stops are read, or for a stop it has no words for.
    expect(words(summaryParts(stopped))).toEqual([
      '120 graded',
      '3 now stop before their tests',
    ]);
    expect(words(summaryParts(stopped, ['wrong_answer']))).toEqual([
      '120 graded',
      '3 now stop before their tests',
    ]);
  });

  it('counts failed, over the limit and graded for the first time in words', () => {
    expect(
      words(
        summaryParts(
          summary({ counts: { ...counts, failed: 1, over_limit: 2, new: 5 } }),
        ),
      ),
    ).toEqual([
      '120 graded',
      '1 failed on Unicon’s side',
      '2 not graded, over the limit',
      '5 graded for the first time',
    ]);
  });

  it('links each count to the submissions of that kind, the graded ones to them all', () => {
    expect(summaryParts(summary()).map((part) => part.change)).toEqual([
      null,
      'down',
      'stopped',
      'up',
    ]);
  });

  it('says what started it, by whom and when', () => {
    const at = formatDateTime(new Date('2026-10-12T14:00:00Z'));
    expect(causeWords(summary())).toBe(
      `After a rejudge by alice, ${at}, against publication 3.`,
    );
    expect(causeWords(summary({ cause: 'save' }))).toBe(
      `After a save that changed how the task grades, ${at}, against publication 3.`,
    );
  });

  it('says while it still runs how many are still being graded', () => {
    expect(runningWords(summary())).toBeNull();
    expect(
      runningWords(summary({ running: true, counts: { ...counts, running: 8 } })),
    ).toBe('Still running: 8 submissions are being graded.');
  });
});

describe('a result a regrade compares', () => {
  it('reads as its points, what stopped it, or its tests passed on a task with no points', () => {
    const side = {
      attempt: 1,
      points: '62.5',
      accepted: 5,
      tests: 8,
      stopped: null,
      values: {},
    };
    expect(sideWords(side)).toBe(`${formatExact('62.5', 2)} points`);
    expect(sideWords({ ...side, points: '0', stopped: 'compile_error' })).toBe(
      'Failed to compile, 0 points',
    );
    expect(sideWords({ ...side, points: null })).toBe('5 of 8 tests passed');
    // Cut as every page shows points (R17).
    expect(sideWords({ ...side, points: '73.336' })).toBe(
      `${formatExact('73.33', 2)} points`,
    );
    expect(sideWords(null)).toBe('—');
  });

  const passed = (values: Record<string, string>) => ({
    attempt: 1,
    points: null,
    accepted: 5,
    tests: 5,
    stopped: null,
    values,
  });

  it('names the values that decided a change on a task with no points, as the forge decides it (#448)', () => {
    const earlier = passed({ time_ms: '28', memory_kb: '900' });
    const now = passed({ time_ms: '40', memory_kb: '900' });
    expect(decidingValues({ change: 'down', earlier, now })).toEqual(['time_ms']);
    // The share of tests passed decides first, and points before it.
    expect(
      decidingValues({ change: 'down', earlier, now: { ...now, accepted: 4 } }),
    ).toEqual([]);
    expect(
      decidingValues({
        change: 'down',
        earlier: { ...earlier, points: '10' },
        now: { ...now, points: '10' },
      }),
    ).toEqual([]);
    expect(decidingValues({ change: 'unchanged', earlier, now })).toEqual([]);
  });

  it('says the values that decided a change by their titles and units, or their keys', () => {
    const side = passed({ time_ms: '40.25' });
    const meanings = [
      {
        name: 'time_ms',
        title: 'Run time',
        unit: 'ms',
        fold: 'max' as const,
        better: 'lower' as const,
      },
    ];
    expect(sideWords(side, { names: ['time_ms'], meanings })).toBe(
      `5 of 5 tests passed, run time ${formatExact('40.25')} ms`,
    );
    expect(sideWords(side, { names: ['time_ms'], meanings: [] })).toBe(
      `5 of 5 tests passed, time_ms ${formatExact('40.25')}`,
    );
    expect(sideWords(passed({}), { names: ['time_ms'], meanings })).toBe(
      '5 of 5 tests passed, no run time',
    );
  });
});
