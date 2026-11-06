import { createContext, useContext } from 'react';

/** `refused`: turned away (the proxy caps streams), waiting to try again. Pages poll when not open. */
export type LiveState = 'open' | 'down' | 'refused';

export const LiveContext = createContext<LiveState>('down');

export function useLiveConnected(): boolean {
  return useContext(LiveContext) === 'open';
}

/** A refusal can last as long as the crowd behind it, so fast pollers slow down. */
export function useLiveRefused(): boolean {
  return useContext(LiveContext) === 'refused';
}

export function useFallbackPoll(fallbackMs = 30_000): number | false {
  return useLiveConnected() ? false : fallbackMs;
}
