import { createTheme, type MantineColorsTuple } from '@mantine/core';

/**
 * The design handoff's theme, unchanged in its values. The only edits are the
 * font family names and the surface and text maps. Colours, type scale and
 * radii are decided values, not placeholders.
 */

const sunset: MantineColorsTuple = [
  '#fff1f5',
  '#ffe0e9',
  '#fbc0d1',
  '#f9a6bd',
  '#f78ca8',
  '#ee6f90',
  '#e0537a',
  '#c4426a',
  '#a8446c',
  '#7d2440',
];

const gold: MantineColorsTuple = [
  '#fff9e6',
  '#fff0c2',
  '#ffe294',
  '#ffd666',
  '#ffc93c',
  '#f5b41f',
  '#d99a0f',
  '#b37d08',
  '#8c6105',
  '#664503',
];

const lilac: MantineColorsTuple = [
  '#f7f2fc',
  '#ede2f8',
  '#dcc6f0',
  '#cfb0ea',
  '#c9a4e2',
  '#b087d4',
  '#9569bd',
  '#7a51a0',
  '#5f3d80',
  '#44295c',
];

const ash: MantineColorsTuple = [
  '#f4f4f2',
  '#ececea',
  '#dcdcdc',
  '#c4c4c4',
  '#9a9a9a',
  '#7d7d7d',
  '#5c5c5c',
  '#3a3a3a',
  '#232323',
  '#141414',
];

/**
 * Mantine builds its neutral chrome out of `dark` and `gray`, not out of
 * whatever extra scales a theme adds, so these two are the surface tokens in
 * Mantine's own shape. The rungs it reads by name:
 *
 *   dark  4 border, 5 hover, 6 background, 7 body
 *   gray  0 hover, 1 skeleton and code, 4 border
 */
const dark: MantineColorsTuple = [
  '#f4f4f4',
  '#d4d4d2',
  '#b0b0b0',
  '#9a9a9a',
  '#3a3a3a',
  '#2e2e2e',
  '#232323',
  '#191919',
  '#141414',
  '#0f0f0f',
];

const gray: MantineColorsTuple = [
  '#f8f8f7',
  '#f4f4f2',
  '#ececea',
  '#e4e4e1',
  '#dcdcdc',
  '#c4c4c4',
  '#9a9a9a',
  '#7d7d7d',
  '#5c5c5c',
  '#3a3a3a',
];

export type ColorSchemeName = 'light' | 'dark';

export type Surfaces = {
  canvas: string;
  chrome: string;
  body: string;
  hover: string;
  border: string;
  borderStrong: string;
};

export type TextColors = {
  primary: string;
  body: string;
  secondary: string;
  meta: string;
  faint: string;
  /**
   * The accent as text. Not the same rung as the accent as a fill: at 13px on
   * the light chrome the filled pink measures 3.6:1, under the body-text floor,
   * so light grounds take the next rung down.
   */
  accent: string;
  /** Labels of destructive actions. */
  danger: string;
  /** Ink on the accent fill. Dark in both schemes: white fails on the pink. */
  onAccent: string;
};

export type VerdictName =
  'accepted' | 'rejected' | 'running' | 'limit' | 'error' | 'queued';

/** [background, foreground] per colour scheme. */
type VerdictColors = Record<VerdictName, Record<ColorSchemeName, [string, string]>>;

export type UniconThemeOther = {
  verdict: VerdictColors;
  surface: Record<ColorSchemeName, Surfaces>;
  text: Record<ColorSchemeName, TextColors>;
  /** The mark's gradient, bottom-left to top-right. */
  sunsetStops: string[];
  /** The mark's size and the gap after it, as fractions of the wordmark size. */
  lockup: { markScale: number; gapScale: number };
  shell: { headerHeight: number; sidebarWidth: number };
};

declare module '@mantine/core' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface MantineThemeOther extends UniconThemeOther {}
}

/**
 * The decided values themselves. Exported so tests and any code outside a React
 * tree read the same object the provider does, not a second copy.
 */
export const uniconTokens: UniconThemeOther = {
  verdict: {
    accepted: { dark: ['#1d3326', '#6ede9b'], light: ['#e3f2e8', '#156034'] },
    rejected: { dark: ['#3a1d1f', '#f4676a'], light: ['#fdeaea', '#a81f1f'] },
    running: { dark: ['#3a3117', '#ffc93c'], light: ['#faeecd', '#6f4e05'] },
    limit: { dark: ['#3a2c17', '#f0a13c'], light: ['#fbe9d3', '#7d4905'] },
    error: { dark: ['#26203a', '#b79cf0'], light: ['#efeafc', '#44295c'] },
    queued: { dark: ['#232323', '#9a9a9a'], light: ['#ececea', '#4a4a4a'] },
  },

  surface: {
    dark: {
      canvas: '#0f0f0f',
      chrome: '#141414',
      body: '#191919',
      hover: '#232323',
      border: '#2e2e2e',
      borderStrong: '#3a3a3a',
    },
    light: {
      canvas: '#f4f4f2',
      chrome: '#fbfbfa',
      body: '#ffffff',
      hover: '#ececea',
      border: '#dcdcdc',
      borderStrong: '#c4c4c4',
    },
  },

  text: {
    dark: {
      primary: '#f4f4f4',
      body: '#b0b0b0',
      secondary: '#9a9a9a',
      meta: '#7d7d7d',
      faint: '#5a5a5a',
      accent: '#f78ca8',
      danger: '#f4676a',
      onAccent: '#2a0f16',
    },
    light: {
      primary: '#1c1c1c',
      body: '#4a4a4a',
      secondary: '#5c5c5c',
      meta: '#8f8f8f',
      faint: '#a8a8a8',
      accent: '#c4426a',
      danger: '#a81f1f',
      onAccent: '#2a0f16',
    },
  },

  sunsetStops: [lilac[4], sunset[4], gold[4]],

  lockup: { markScale: 0.525, gapScale: 0.1 },

  shell: { headerHeight: 48, sidebarWidth: 178 },
};

export const theme = createTheme({
  colors: { sunset, gold, lilac, ash, dark, gray },
  primaryColor: 'sunset',
  primaryShade: { light: 6, dark: 4 },

  fontFamily: '"Manrope Variable", Manrope, system-ui, sans-serif',
  fontFamilyMonospace: '"JetBrains Mono Variable", "JetBrains Mono", monospace',

  /**
   * The handoff's type scale in Mantine's own five slots. Mantine's defaults
   * are a different ladder, and every component it draws for you reads them.
   *
   *   xs 12  mono: code, verdicts, ids, timers
   *   sm 13  table cells, helper text, most chrome
   *   md 14  body prose
   *   lg 15  section headings
   *   xl 21  screen titles
   */
  fontSizes: { xs: '12px', sm: '13px', md: '14px', lg: '15px', xl: '21px' },

  headings: {
    fontFamily: '"Manrope Variable", Manrope, system-ui, sans-serif',
    sizes: {
      h1: { fontSize: '34px', fontWeight: '800', lineHeight: '1.1' },
      h2: { fontSize: '21px', fontWeight: '700', lineHeight: '1.25' },
      h3: { fontSize: '15px', fontWeight: '600', lineHeight: '1.4' },
    },
  },

  defaultRadius: 'sm',
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '10px' },

  shadows: { xs: 'none', sm: 'none', md: 'none', lg: 'none', xl: 'none' },

  other: uniconTokens,
});
