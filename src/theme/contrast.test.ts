import { describe, expect, it } from 'vitest';
import { uniconTokens, type ColorSchemeName } from './theme';

/**
 * Contrast was checked at 4.5:1 for body text and 3:1 for headline-scale type
 * in both schemes. This is that check as a test, so changing a grey by two hex
 * digits fails here rather than being noticed by somebody reading a leaderboard
 * in a bright hall. WCAG 2.1 relative luminance and contrast ratio, written out
 * rather than pulling in a colour library.
 */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** The four surfaces text is ever set on. Borders are lines, not grounds. */
const GROUNDS = ['canvas', 'chrome', 'body', 'hover'] as const;
type Ground = (typeof GROUNDS)[number];

type Rule = {
  /** The --unicon-text-* token, without the prefix. */
  token: 'body' | 'secondary' | 'accent' | 'meta';
  /** Where it is allowed to appear. */
  on: readonly Ground[];
  floor: number;
  why: string;
};

/**
 * `meta` is the 10px uppercase label token and nothing else, so it is held to
 * the 3:1 floor and only on the two grounds labels sit on. Readable content
 * uses `secondary` instead.
 */
const RULES: Rule[] = [
  {
    token: 'body',
    on: GROUNDS,
    floor: 4.5,
    why: 'prose and error messages',
  },
  {
    token: 'secondary',
    on: GROUNDS,
    floor: 4.5,
    why: 'helper lines people actually read',
  },
  {
    token: 'accent',
    on: ['chrome', 'body'],
    floor: 4.5,
    why: 'the header sign-in link, at 13px',
  },
  {
    token: 'meta',
    on: ['chrome', 'body'],
    floor: 3,
    why: '10px uppercase labels only',
  },
];

const SCHEMES: ColorSchemeName[] = ['light', 'dark'];

describe('text on surfaces', () => {
  for (const rule of RULES) {
    for (const scheme of SCHEMES) {
      it(`--unicon-text-${rule.token} clears ${String(rule.floor)}:1 in ${scheme} (${rule.why})`, () => {
        const foreground = uniconTokens.text[scheme][rule.token];
        for (const ground of rule.on) {
          const background = uniconTokens.surface[scheme][ground];
          const ratio = contrastRatio(foreground, background);
          expect(
            ratio,
            `${rule.token} on ${ground}: ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(rule.floor);
        }
      });
    }
  }
});
