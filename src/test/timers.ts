import { afterEach, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';

/** Timers only: `Date` stays real, and the clock keeps pace so library waits still move. */
export function withFakeTimers(): void {
  beforeEach(() => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

export async function passTime(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Steps the clock until `find` passes, for timers set one after another (like retries). */
export async function passTimeUntil<T>(
  find: () => T,
  { within = 30_000, step = 100 }: { within?: number; step?: number } = {},
): Promise<T> {
  for (let passed = 0; passed < within; passed += step) {
    try {
      return find();
    } catch {
      await passTime(step);
    }
  }
  return find();
}

export function fakeTimerUser(): UserEvent {
  return userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
}
