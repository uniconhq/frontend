import { describe, expect, it } from 'vitest';
import type { RegradeSummary } from '@/api/types';
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

  it('says what stopped a run before its tests in plain words, one or several, in one count with one list', () => {
    const stopped = summary({ counts: { ...counts, stopped: 3 } });
    expect(
      words(summaryParts(stopped, ['compile_error', 'time_limit', 'time_limit'])),
    ).toEqual([
      '120 graded',
      '1 now fails to compile, 2 now run out of time before their tests',
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
    expect(summaryParts(summary()).every((part) => part.linked)).toBe(true);
  });

  it('links no list for the graded while it would also hold those not graded (#448)', () => {
    const parts = summaryParts(
      summary({
        total: 125,
        running: true,
        counts: { ...counts, unchanged: 120, running: 5 },
      }),
    );
    expect(parts.map((part) => [part.words, part.linked])).toEqual([
      ['120 graded', false],
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
      accepted: 5,
      tests: 8,
      stopped: null,
    };
    expect(sideWords(side)).toBe('5 of 8 tests passed');
    expect(sideWords({ ...side, stopped: 'compile_error' })).toBe(
      'Failed to compile, 5 of 8 tests passed',
    );
    expect(sideWords(null)).toBe('—');
  });

  const passed = () => ({
    attempt: 1,
    accepted: 5,
    tests: 5,
    stopped: null,
  });

  it('names nothing once a result no longer carries the values that decided a change', () => {
    const earlier = passed();
    const now = passed();
    expect(decidingValues({ change: 'down', earlier, now })).toEqual([]);
    expect(
      decidingValues({ change: 'down', earlier, now: { ...now, accepted: 4 } }),
    ).toEqual([]);
    expect(decidingValues({ change: 'unchanged', earlier, now })).toEqual([]);
  });

  it('says how many tests passed', () => {
    expect(sideWords(passed())).toBe('5 of 5 tests passed');
  });
});
