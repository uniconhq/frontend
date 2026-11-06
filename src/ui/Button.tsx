import { Button as MantineButton } from '@mantine/core';
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';

/**
 * Primary has dark ink because white text fails contrast on the pink. Danger is
 * an outline: the destructive step is inside the dialog, and red before it
 * teaches people to click through.
 *
 * The outline is set as Mantine's button variables so the hover rule still fires.
 * A button does something; a link (PageLink, OutLink) goes somewhere. A card
 * or form has at most one primary, and no destructive button sits on a hub.
 * Actions are `sm`; `xs` is only for an action on one row of a list or table.
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
  ref,
  ...passed
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
  ref?: Ref<HTMLButtonElement>;
} & Omit<
  HTMLAttributes<HTMLButtonElement>,
  'children' | 'onClick' | 'color' | 'style' | 'className'
>) {
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

  const look = {
    'aria-label': label,
    disabled,
    loading,
    size,
    fw: 600,
    fz: 13,
    variant: variant === 'primary' ? 'filled' : 'default',
    style: variant === 'primary' ? undefined : outline,
    c: disabled && !loading ? undefined : color,
  } as const;

  if (href !== undefined)
    return (
      <MantineButton component="a" href={href} {...look}>
        {children}
      </MantineButton>
    );
  return (
    <MantineButton {...passed} ref={ref} type={type} onClick={onClick} {...look}>
      {children}
    </MantineButton>
  );
}
