import { useEffect, useState } from 'react';
import { serverNow } from '@/lib/time';
import { $api } from './query';

const AGAIN_MS = 60_000;

/** `byDevice`: the server's time never came, so countdowns use the browser's clock. */
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

/** Until `measured`, `at` is the browser's time: fine for wording, not for counting. */
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

export const BY_DEVICE =
  "Counted by this device's clock, since Unicon's time could not be read.";
