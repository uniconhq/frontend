import type { CSSVariablesResolver } from '@mantine/core';
import type { Surfaces, TextColors } from './theme';

/**
 * Surfaces and text colours as CSS custom properties, so component CSS can say
 * `var(--unicon-chrome)` instead of reading the theme in JavaScript and
 * re-rendering on a colour scheme change. Mantine's own disabled colours,
 * which every disabled button and field reads, are set from the same
 * surfaces and text, so a disabled control sits on the page's greys.
 */
const vars = (surfaces: Surfaces, text: TextColors) => ({
  '--unicon-canvas': surfaces.canvas,
  '--unicon-chrome': surfaces.chrome,
  '--unicon-body': surfaces.body,
  '--unicon-hover': surfaces.hover,
  '--unicon-border': surfaces.border,
  '--unicon-border-strong': surfaces.borderStrong,
  '--unicon-text-primary': text.primary,
  '--unicon-text-body': text.body,
  '--unicon-text-secondary': text.secondary,
  '--unicon-text-meta': text.meta,
  '--unicon-text-faint': text.faint,
  '--unicon-text-accent': text.accent,
  '--unicon-text-danger': text.danger,
  '--unicon-text-on-accent': text.onAccent,
  '--mantine-color-disabled': surfaces.hover,
  '--mantine-color-disabled-color': text.meta,
  '--mantine-color-disabled-border': surfaces.border,
});

export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
  variables: {
    '--unicon-header-height': `${theme.other.shell.headerHeight}px`,
    '--unicon-sidebar-width': `${theme.other.shell.sidebarWidth}px`,
  },
  light: vars(theme.other.surface.light, theme.other.text.light),
  dark: vars(theme.other.surface.dark, theme.other.text.dark),
});
