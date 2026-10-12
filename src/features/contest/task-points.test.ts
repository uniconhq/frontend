import { describe, expect, it } from 'vitest';
import { formatExact } from '@/lib/exact';
import { formatWhen } from '@/lib/time';
import { taskPointsText } from './task-points';

const NOW = new Date('2026-09-12T10:00:00Z');
const REVEAL = '2026-09-12T14:00:00Z';

describe("an entrant's points on a task", () => {
  it('reads as their points out of the worth', () => {
    expect(
      taskPointsText(
        { worth: '100', points: { shown: '62', pending: '0', pending_until: null } },
        NOW,
      ),
    ).toEqual({ score: '62 / 100', pending: null });
  });

  it('keeps the digits exact, rounding only for reading', () => {
    const shown = '33.333333333333333333333333333333';
    expect(
      taskPointsText(
        { worth: '100', points: { shown, pending: '0', pending_until: null } },
        NOW,
      )?.score,
    ).toBe(`${formatExact('33.33')} / 100`);
    expect(
      taskPointsText(
        {
          worth: '12345678901234567890',
          points: { shown: '12345678901234567890', pending: '0', pending_until: null },
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
        { worth: '100', points: { shown: '62', pending: '38', pending_until: REVEAL } },
        NOW,
      ),
    ).toEqual({ score: '62 / 100', pending: `More shown at ${at}` });
    expect(
      taskPointsText(
        {
          worth: '100',
          points: { shown: null, pending: '100', pending_until: REVEAL },
        },
        NOW,
      ),
    ).toEqual({ score: '— / 100', pending: `Shown at ${at}` });
  });

  it('reads a shown 0 as 0, and only nothing shown yet as —', () => {
    const at = formatWhen(new Date(REVEAL), NOW);
    expect(
      taskPointsText(
        { worth: '100', points: { shown: '0', pending: '40', pending_until: REVEAL } },
        NOW,
      ),
    ).toEqual({ score: '0 / 100', pending: `More shown at ${at}` });
    expect(
      taskPointsText(
        { worth: '100', points: { shown: null, pending: '0', pending_until: null } },
        NOW,
      ),
    ).toEqual({ score: '— / 100', pending: null });
  });

  it('never reads as the worth while the points are short of it', () => {
    const score = (shown: string, worth = '100') =>
      taskPointsText(
        { worth, points: { shown, pending: '0', pending_until: null } },
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
        { worth: null, points: { shown: '0', pending: '0', pending_until: null } },
        NOW,
      ),
    ).toBeNull();
    expect(taskPointsText({ worth: null, points: null }, NOW)).toBeNull();
  });

  it('reads as the worth alone for someone the contest gives no points', () => {
    expect(taskPointsText({ worth: '100', points: null }, NOW)).toEqual({
      score: '100 points',
      pending: null,
    });
    expect(taskPointsText({ worth: '1', points: null }, NOW)).toEqual({
      score: '1 point',
      pending: null,
    });
    expect(taskPointsText({ worth: '1.0', points: null }, NOW)?.score).toBe('1 point');
  });
});
