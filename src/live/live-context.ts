import { createContext, useContext } from 'react';

/**
 * Whether this session's live stream is open. A page that shows something
 * that changes polls while it is not, so a proxy that will not hold a
 * connection open costs freshness and nothing more.
 */
export const LiveContext = createContext(false);

export function useLiveConnected(): boolean {
  return useContext(LiveContext);
}

/**
 * How often a page that shows something changing asks again on its own:
 * never while the stream will tell it, and every `fallbackMs` while not.
 */
export function useFallbackPoll(fallbackMs = 30_000): number | false {
  return useLiveConnected() ? false : fallbackMs;
}
