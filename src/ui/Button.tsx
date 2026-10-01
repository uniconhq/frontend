import { Button as MantineButton } from '@mantine/core';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Primary is a flat sunset fill with dark ink: the pink is light enough that
 * white text fails contrast in both schemes. Secondary and danger are outlines
 * with the text colour carrying the meaning, because the destructive step is
 * the one inside the dialog and a wall of red before then teaches people to
 * click through it.
 *
 * The outline is set as Mantine's own button variables rather than as a
 * background and a border, so the hover rule still fires. A disabled button
 * drops its variant's text colour and takes the theme's disabled one, the
 * same grey for every variant, so it never reads as a pink button with its
 * fill taken away. `href` turns the
 * button into a real anchor, for the trips out of the app the browser has to
 * perform.
 */
export function Button({
  children,
  onClick,
  href,
  variant = 'primary',
  size = 'sm',
  disabled = false,
  loading = false,
  type = 'button',
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'xs' | 'sm';
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
  /** A fuller name for a screen reader, when the text alone is one of many alike. */
  label?: string;
}) {
  const color =
    variant === 'primary'
      ? 'var(--unicon-text-on-accent)'
      : variant === 'danger'
        ? 'var(--unicon-text-danger)'
        : 'var(--unicon-text-body)';

  const outline = {
    '--button-bg': 'transparent',
    '--button-bd': '1px solid var(--unicon-border-strong)',
    '--button-hover': 'var(--unicon-hover)',
  } as CSSProperties;

  const asAnchor = href === undefined ? {} : { component: 'a' as const, href };

  return (
    <MantineButton
      {...asAnchor}
      {...(href === undefined ? { type, onClick } : {})}
      aria-label={label}
      disabled={disabled}
      loading={loading}
      size={size}
      fw={600}
      fz={13}
      variant={variant === 'primary' ? 'filled' : 'default'}
      style={variant === 'primary' ? undefined : outline}
      c={disabled && !loading ? undefined : color}
    >
      {children}
    </MantineButton>
  );
}
