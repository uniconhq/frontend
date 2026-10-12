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
        { worth: '100', points: { shown: '0', pending: '100', pending_until: REVEAL } },
        NOW,
      ),
    ).toEqual({ score: '— / 100', pending: `Shown at ${at}` });
  });

  it('is nothing on a task that gives no points, or for someone given none', () => {
    expect(
      taskPointsText(
        { worth: null, points: { shown: '0', pending: '0', pending_until: null } },
        NOW,
      ),
    ).toBeNull();
    expect(taskPointsText({ worth: '100', points: null }, NOW)).toBeNull();
  });
});
