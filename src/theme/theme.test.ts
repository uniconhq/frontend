import { describe, expect, it } from 'vitest';
import { theme, uniconTokens } from './theme';

describe('theme', () => {
  it('carries the four colour scales, ten shades each', () => {
    for (const name of ['sunset', 'gold', 'lilac', 'ash']) {
      expect(theme.colors?.[name], name).toHaveLength(10);
    }
  });

  it('keeps one pink identity with a different rung per scheme', () => {
    expect(theme.primaryColor).toBe('sunset');
    expect(theme.primaryShade).toEqual({ light: 6, dark: 4 });
  });

  it('never uses the brand pink for a verdict', () => {
    const sunset = new Set(theme.colors?.sunset ?? []);
    for (const [name, pair] of Object.entries(uniconTokens.verdict)) {
      for (const scheme of ['dark', 'light'] as const) {
        for (const color of pair[scheme]) {
          expect(sunset.has(color), `${name}.${scheme} ${color}`).toBe(false);
        }
      }
    }
  });
});
