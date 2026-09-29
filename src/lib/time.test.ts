import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  recordServerTime,
  serverClockOffsetMs,
  serverNow,
} from './time';

describe('server clock', () => {
  it('charges half the round trip to each direction', () => {
    const serverIso = '2026-09-12T10:00:00.000Z';
    const serverMs = Date.parse(serverIso);
    recordServerTime(serverIso, serverMs - 100, serverMs + 100);

    expect(serverClockOffsetMs()).toBe(0);
  });

  it('reports a browser clock that runs slow', () => {
    const receivedAt = Date.parse('2026-09-12T09:59:00.000Z');
    recordServerTime('2026-09-12T10:00:00.000Z', receivedAt, receivedAt);

    expect(serverClockOffsetMs()).toBe(60_000);
    expect(serverNow().getTime() - Date.now()).toBeCloseTo(60_000, -2);
  });
});

describe('a countdown', () => {
  it('shows days only when there are any and pads what follows the first', () => {
    const second = 1000;
    expect(formatDuration(-5 * second)).toBe('0s');
    expect(formatDuration(9 * second)).toBe('9s');
    expect(formatDuration(270 * second)).toBe('4m 30s');
    expect(formatDuration((3600 + 5 * 60 + 9) * second)).toBe('1h 05m 09s');
    expect(formatDuration((86_400 + 2 * 3600 + 5 * 60 + 9) * second + 999)).toBe(
      '1d 02h 05m 09s',
    );
  });
});
