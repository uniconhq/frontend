import type { ReactNode } from 'react';
import classes from './Chip.module.css';

export type ChipTone = 'quiet' | 'live' | 'warn';

/**
 * One word about where a thing stands, such as Draft or Running, beside its
 * name. `live` is for what is under way now, `warn` for what needs an
 * organiser, and `quiet` for the rest.
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
