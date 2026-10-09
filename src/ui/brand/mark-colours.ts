import { useMemo } from 'react';
import { useMantineTheme } from '@mantine/core';

/**
 * Five solid colours cut from the mark's
 * gradient (lilac to sunset to gold) at its two ends and three points
 * between, so the graph reads as the mark does.
 */

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function hexOf([red, green, blue]: [number, number, number]): string {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** The colour at `at`, 0 to 1, along a gradient of evenly spaced stops. */
function along(stops: string[], at: number): string {
  if (stops.length === 0) return '#888888';
  if (stops.length === 1) return stops[0] ?? '#888888';
  const scaled = at * (stops.length - 1);
  const index = Math.min(Math.floor(scaled), stops.length - 2);
  const share = scaled - index;
  const from = channels(stops[index] ?? '#000000');
  const to = channels(stops[index + 1] ?? '#000000');
  return hexOf(
    [0, 1, 2].map(
      (channel) => from[channel]! + (to[channel]! - from[channel]!) * share,
    ) as [number, number, number],
  );
}

/** Five colours, first to last, from the gradient's stops. */
function fiveColours(stops: string[]): string[] {
  return [0, 0.25, 0.5, 0.75, 1].map((at) => along(stops, at));
}

/** The mark's gradient cut into five solid colours, first to last. */
export function useMarkColours(): string[] {
  const theme = useMantineTheme();
  return useMemo(() => fiveColours(theme.other.sunsetStops), [theme]);
}
