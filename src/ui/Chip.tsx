import type { ReactNode } from 'react';
import classes from './Chip.module.css';

export type ChipTone = 'quiet' | 'live' | 'warn';

/**
 * `live` is for what is under way or open to everyone, `warn` for what needs
 * an organiser, and `quiet` for the rest.
 */
export function Chip({
  children,
  tone = 'quiet',
}: {
  children: ReactNode;
  tone?: ChipTone;
}) {
  return <span className={`${classes.chip} ${classes[tone]}`}>{children}</span>;
}
