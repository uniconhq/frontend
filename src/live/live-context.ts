import { createContext, useContext } from 'react';

/**
 * Where this session's live stream stands: `open`; `down` while it is first
 * opening or the browser is opening it again after a drop; and `refused`
 * while it waits to be tried again after the proxy or the backend turned it
 * away, as the proxy does once it holds every stream it allows. A page that
 * shows something that changes polls while it is not open, so a proxy that
 * will not hold a connection open costs freshness and nothing more.
 */
export type LiveState = 'open' | 'down' | 'refused';

export const LiveContext = createContext<LiveState>('down');

export function useLiveConnected(): boolean {
  return useContext(LiveContext) === 'open';
}

/**
 * Whether the stream was turned away. A refusal can last as long as the
 * crowd that caused it, so a page that would poll every couple of seconds
 * waits longer between reads while it holds.
 */
export function useLiveRefused(): boolean {
  return useContext(LiveContext) === 'refused';
}

/**
 * How often a page that shows something changing asks again on its own:
 * never while the stream will tell it, and every `fallbackMs` while not.
 */
export function useFallbackPoll(fallbackMs = 30_000): number | false {
  return useLiveConnected() ? false : fallbackMs;
}
