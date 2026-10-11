import { useEffect, useState } from 'react';
import { serverNow } from '@/lib/time';
import { $api } from './query';

/** How often the server's time is asked for again after it did not come in. */
const AGAIN_MS = 60_000;

/**
 * Whether the server's time has been asked for, which is what measures how
 * far this browser's clock is out, and whether it came in. When the server
 * did not answer, even after the query's own retries, the browser's clock is
 * all a countdown has to go by: `byDevice` says so, and the time is asked
 * for again every minute until it comes in.
 */
function useServerTime(): { measured: boolean; byDevice: boolean } {
  const query = $api.useQuery('get', '/api/v1/time', undefined, {
    refetchInterval: (found) => (found.state.data === undefined ? AGAIN_MS : false),
  });
  return {
    measured: query.isFetched,
    byDevice: query.isFetched && query.data === undefined,
  };
}

const TICK_MS = 1000;

/**
 * The server's time now, read again every second once it has been asked for,
 * so a countdown counts; with `measured` and `byDevice` as `useServerTime`
 * gives them. Until the server's time has been asked for, `at` is this
 * browser's own, which a page uses only to choose what to say, never to count.
 */
export function useServerClock(): { at: number; measured: boolean; byDevice: boolean } {
  const time = useServerTime();
  const [, setTicks] = useState(0);
  useEffect(() => {
    if (!time.measured) return;
    const tick = setInterval(() => setTicks((ticks) => ticks + 1), TICK_MS);
    return () => clearInterval(tick);
  }, [time.measured]);
  return { at: serverNow().getTime(), ...time };
}

/** What a countdown says while it goes by the browser's clock. */
export const BY_DEVICE =
  "Counted by this device's clock: the server's time did not come in.";
