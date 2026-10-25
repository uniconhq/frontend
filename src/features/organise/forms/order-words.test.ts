import { describe, expect, it } from 'vitest';
import type { OrderKeyValues } from './board-values';
import { canMoveKey } from './order-words';

const points: OrderKeyValues = { kind: 'points' };
const penalty: OrderKeyValues = { kind: 'penalty', perAttempt: '20' };
const time: OrderKeyValues = { kind: 'value', name: 'time_ms' };

describe('moving a way to rank', () => {
  it('stops at either end', () => {
    expect(canMoveKey([points, time], 0, -1)).toBe(false);
    expect(canMoveKey([points, time], 1, 1)).toBe(false);
    expect(canMoveKey([points, time], 1, -1)).toBe(true);
  });

  it('never puts penalty minutes first, from below or by moving the first down', () => {
    expect(canMoveKey([points, penalty, time], 1, -1)).toBe(false);
    expect(canMoveKey([points, penalty, time], 0, 1)).toBe(false);
    expect(canMoveKey([points, penalty, time], 2, -1)).toBe(true);
    expect(canMoveKey([time, points, penalty], 0, 1)).toBe(true);
  });

  it('lets a file that starts with penalty minutes move them out of first', () => {
    expect(canMoveKey([penalty, points], 0, 1)).toBe(true);
    expect(canMoveKey([penalty, points], 1, -1)).toBe(true);
  });
});
