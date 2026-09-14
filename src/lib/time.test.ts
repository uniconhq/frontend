import { describe, expect, it } from 'vitest';
import { recordServerTime, serverClockOffsetMs, serverNow } from './time';

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
