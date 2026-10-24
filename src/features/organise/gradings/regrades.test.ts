import { describe, expect, it } from 'vitest';
import type { RegradeSummary } from '@/api/types';
import { formatDateTime } from '@/lib/time';
import { causeWords, runningWords, sideWords, summaryParts } from './regrades';

const counts = {
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
    counts: { ...counts, unchanged: 117, failed: 3 },
    ...more,
  };
}

const words = (parts: { words: string }[]) => parts.map((part) => part.words);

describe("a regrade's summary", () => {
  it('reads as what it graded, then what did not grade, leaving out a 0', () => {
    expect(words(summaryParts(summary()))).toEqual([
      '120 graded',
      '3 failed on Unicon’s side',
    ]);
    expect(
      words(summaryParts(summary({ counts: { ...counts, unchanged: 120 } }))),
    ).toEqual(['120 graded']);
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
      'failed',
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
  it('reads as the attempt it is, or a dash where there is none', () => {
    expect(sideWords({ attempt: 2 })).toBe('Attempt 2');
    expect(sideWords(null)).toBe('—');
  });
});
