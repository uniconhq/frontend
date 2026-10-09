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
export function useServerTime(): { measured: boolean; byDevice: boolean } {
  const query = $api.useQuery('get', '/api/v1/time', undefined, {
    refetchInterval: (found) => (found.state.data === undefined ? AGAIN_MS : false),
  });
  return {
    measured: query.isFetched,
    byDevice: query.isFetched && query.data === undefined,
  };
}

/** What a countdown says while it goes by the browser's clock. */
export const BY_DEVICE =
  "Counted by this device's clock: the server's time did not come in.";
