import { describe, expect, it } from 'vitest';
import { formatExact } from '@/lib/exact';
import { formatWhen } from '@/lib/time';
import type { BoardPoints } from '@/api/types';
import { boardPointsText, taskPointsText } from './task-points';

/** One leaderboard's count, covering the task, out of `most`, or of the worth with none given. */
function on(points: BoardPoints['points'], most: string | null = null): BoardPoints[] {
  return [{ board: 'Standings', covers: true, points, most }];
}

const NOW = new Date('2026-09-12T10:00:00Z');
const REVEAL = '2026-09-12T14:00:00Z';

describe("an entrant's points on a task", () => {
  it('reads as their points out of the worth', () => {
    expect(
      taskPointsText(
        {
          worth: '100',
          points: on({ shown: '62', pending: '0', pending_until: null }),
        },
        NOW,
      ),
    ).toEqual({ score: '62 / 100', pending: null });
  });

  it('keeps the digits exact, rounding only for reading', () => {
    const shown = '33.333333333333333333333333333333';
    expect(
      taskPointsText(
        { worth: '100', points: on({ shown, pending: '0', pending_until: null }) },
        NOW,
      )?.score,
    ).toBe(`${formatExact('33.33')} / 100`);
    expect(
      taskPointsText(
        {
          worth: '12345678901234567890',
          points: on({
            shown: '12345678901234567890',
            pending: '0',
            pending_until: null,
          }),
        },
        NOW,
      )?.score,
    ).toBe(
      `${formatExact('12345678901234567890')} / ${formatExact('12345678901234567890')}`,
    );
  });

  it('says when points held back are shown, without saying how many', () => {
    const at = formatWhen(new Date(REVEAL), NOW);
    expect(
      taskPointsText(
        {
          worth: '100',
          points: on({ shown: '62', pending: '38', pending_until: REVEAL }),
        },
        NOW,
      ),
    ).toEqual({ score: '62 / 100', pending: `More shown at ${at}` });
    expect(
      taskPointsText(
        {
          worth: '100',
          points: on({ shown: null, pending: '100', pending_until: REVEAL }),
        },
        NOW,
      ),
    ).toEqual({ score: '— / 100', pending: `Shown at ${at}` });
  });

  it('reads a shown 0 as 0, and only nothing shown yet as —', () => {
    const at = formatWhen(new Date(REVEAL), NOW);
    expect(
      taskPointsText(
        {
          worth: '100',
          points: on({ shown: '0', pending: '40', pending_until: REVEAL }),
        },
        NOW,
      ),
    ).toEqual({ score: '0 / 100', pending: `More shown at ${at}` });
    expect(
      taskPointsText(
        {
          worth: '100',
          points: on({ shown: null, pending: '0', pending_until: null }),
        },
        NOW,
      ),
    ).toEqual({ score: '— / 100', pending: null });
  });

  it('never reads as the worth while the points are short of it', () => {
    const score = (shown: string, worth = '100') =>
      taskPointsText(
        { worth, points: on({ shown, pending: '0', pending_until: null }) },
        NOW,
      )?.score;
    expect(score('99.996')).toBe(`${formatExact('99.99')} / 100`);
    expect(score('99.999999')).toBe(`${formatExact('99.99')} / 100`);
    expect(score('62.678')).toBe(`${formatExact('62.67')} / 100`);
    expect(score('100')).toBe('100 / 100');
    expect(score('99.996', '99.996')).toBe(
      `${formatExact('100')} / ${formatExact('100')}`,
    );
    expect(score('99.995', '99.996')).toBe(
      `${formatExact('99.99')} / ${formatExact('100')}`,
    );
  });

  it('is nothing on a task that gives no points', () => {
    expect(
      taskPointsText(
        { worth: null, points: on({ shown: '0', pending: '0', pending_until: null }) },
        NOW,
      ),
    ).toBeNull();
    expect(taskPointsText({ worth: null, points: [] }, NOW)).toBeNull();
  });

  it('reads as out of the most the leaderboard can count from the task', () => {
    expect(
      taskPointsText(
        {
          worth: '100',
          points: on({ shown: '40', pending: '0', pending_until: null }, '60'),
        },
        NOW,
      ),
    ).toEqual({ score: '40 / 60', pending: null });
  });

  it('says the task is not on the leaderboard where the one leaderboard does not cover it', () => {
    expect(
      taskPointsText(
        {
          worth: '100',
          points: [{ board: 'Standings', covers: false, points: null, most: null }],
        },
        NOW,
      ),
    ).toEqual({ score: 'Not on the leaderboard', pending: null });
  });

  it('says the leaderboard counts none of the task where the one leaderboard covers it for 0 points (#453)', () => {
    expect(
      taskPointsText(
        {
          worth: '100',
          points: on({ shown: '0', pending: '0', pending_until: null }, '0'),
        },
        NOW,
      ),
    ).toEqual({ score: 'Counts no points on the leaderboard', pending: null });
  });

  it('reads as the worth alone for someone the contest gives no points', () => {
    expect(taskPointsText({ worth: '100', points: [] }, NOW)).toEqual({
      score: '100 points',
      pending: null,
    });
    expect(taskPointsText({ worth: '1', points: [] }, NOW)).toEqual({
      score: '1 point',
      pending: null,
    });
    expect(taskPointsText({ worth: '1.0', points: [] }, NOW)?.score).toBe('1 point');
  });
});

describe("an entrant's points on a task in one leaderboard's column", () => {
  const cell = (more: Partial<BoardPoints>): BoardPoints => ({
    board: 'Practice',
    covers: true,
    points: { shown: '62', pending: '0', pending_until: null },
    most: '100',
    ...more,
  });

  it('reads as that board counts the task, out of the most it can count', () => {
    expect(boardPointsText(cell({}), '100', NOW)).toEqual({
      score: '62 / 100',
      pending: null,
    });
    expect(
      boardPointsText(
        cell({
          points: { shown: '59.999', pending: '0', pending_until: null },
          most: '60',
        }),
        '100',
        NOW,
      ),
    ).toEqual({ score: `${formatExact('59.99')} / 60`, pending: null });
  });

  it('reads — / most with when it is shown, while the board shows nothing of the task yet', () => {
    const at = formatWhen(new Date(REVEAL), NOW);
    expect(
      boardPointsText(
        cell({ points: { shown: null, pending: '100', pending_until: REVEAL } }),
        '100',
        NOW,
      ),
    ).toEqual({ score: '— / 100', pending: `Shown at ${at}` });
  });

  it('reads — where the board does not cover the task, or counts nothing from it', () => {
    expect(
      boardPointsText(cell({ covers: false, points: null, most: null }), '100', NOW),
    ).toEqual({
      score: '—',
      pending: null,
    });
    expect(boardPointsText(cell({ most: '0' }), '100', NOW)).toEqual({
      score: '—',
      pending: null,
    });
  });

  it('is nothing on a task that gives no points', () => {
    expect(boardPointsText(cell({ points: null, most: null }), null, NOW)).toBeNull();
    expect(boardPointsText(cell({ covers: false }), null, NOW)).toBeNull();
  });
});
