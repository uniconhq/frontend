import { describe, expect, it } from 'vitest';
import type { BoardKey } from '@/api/types';
import { formatExact } from '@/lib/exact';
import { cell, icpc } from '@/test/boards';
import { cellLines, cellPlaces, keyLabel, keyPlaces } from './board-text';

const POINTS: BoardKey = { by: 'points', better: 'higher', per_attempt: null };
const PENALTY: BoardKey = { by: 'penalty', better: 'lower', per_attempt: 20 };
const MINUTE: BoardKey = { by: 'penalty', better: 'lower', per_attempt: 0 };
const TIME: BoardKey = { by: 'time_ms', better: 'lower', per_attempt: null };

describe('a board key', () => {
  it('is named by what it ranks by, a free penalty by the minute submitted', () => {
    expect([POINTS, PENALTY, MINUTE, TIME].map(keyLabel)).toEqual([
      'Points',
      'Penalty',
      'Submitted at minute',
      'time_ms',
    ]);
  });
});

describe('a cell', () => {
  it('shows each number it counts with what it is, and the attempts before', () => {
    const counting = cell({
      counting: true,
      numbers: { points: '1', penalty: '45' },
      attempts: 2,
    });
    expect(cellLines([POINTS, PENALTY], counting, {})).toEqual([
      '1 point',
      '45 penalty',
      '2 attempts before',
    ]);
    expect(
      cellLines([POINTS, MINUTE], { ...counting, attempts: 0 }, { points: 2 }),
    ).toEqual(['1 point', 'minute 45']);
  });

  it('shows how often a cell that counts nothing was tried, or a dash', () => {
    expect(cellLines([POINTS], cell({ attempts: 3 }), {})).toEqual(['3 attempts']);
    expect(cellLines([POINTS], cell(), {})).toEqual(['—']);
  });

  it('shows a value to the decimals that tell neighbours apart', () => {
    const fast = cell({ counting: true, numbers: { time_ms: '12.5' } });
    expect(cellLines([TIME], fast, { time_ms: 2 })).toEqual([
      `${formatExact('12.5')} time_ms`,
    ]);
  });
});

describe('the decimals a board is shown to', () => {
  it('takes more where two rows next to each other would read alike', () => {
    const board = icpc({
      keys: [POINTS],
      rows: icpc().rows.map((found, index) => ({
        ...found,
        keys: [['82.501', '82.5', '70'][index] ?? null],
        cells: {
          sum: cell({ numbers: { points: ['1.004', '1.001', '1'][index] ?? '0' } }),
        },
      })),
    });
    expect(keyPlaces(board)).toEqual([3]);
    expect(cellPlaces(board, 'sum')).toEqual({ points: 3 });
  });
});
