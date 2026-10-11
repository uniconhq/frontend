import { afterEach, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';

/**
 * Fake timers for the tests of pages that poll. The clock keeps pace with the
 * real one, so React, React Query, MSW and Testing Library's waits all move on
 * their own, and `passTime` jumps it ahead: the next poll a second from now
 * happens at once. Only the timer functions are faked; `Date` stays real, so
 * the server clock reads as it does everywhere else.
 *
 * Call it inside a `describe`; it installs the fake timers before each test and
 * takes them away after it.
 */
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

/** Moves the fake clock on by `ms`, running every timer that comes due. */
export async function passTime(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Moves the fake clock on a step at a time until `find` stops throwing, and
 * returns what it found; past `within` milliseconds on the clock, `find`'s own
 * error is thrown. For a wait made of timers that are each set only once
 * something else has happened, such as the client's retries, each set after
 * the request before it failed: every timer comes due a step after it is set.
 */
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

/** A user whose pauses between keystrokes run on the fake clock. */
export function fakeTimerUser(): UserEvent {
  return userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
}
