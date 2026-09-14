import type { CSSVariablesResolver } from '@mantine/core';
import type { Surfaces, TextColors } from './theme';

/**
 * Surfaces and text colours as CSS custom properties, so component CSS can say
 * `var(--unicon-chrome)` instead of reading the theme in JavaScript and
 * re-rendering on a colour scheme change.
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
});

export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
  variables: {
    '--unicon-header-height': `${theme.other.shell.headerHeight}px`,
    '--unicon-sidebar-width': `${theme.other.shell.sidebarWidth}px`,
    '--unicon-sunset-gradient': theme.other.sunsetGradient,
  },
  light: vars(theme.other.surface.light, theme.other.text.light),
  dark: vars(theme.other.surface.dark, theme.other.text.dark),
});
