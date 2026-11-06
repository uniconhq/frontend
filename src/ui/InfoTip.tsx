import type { ReactNode } from 'react';
import { Popout } from './Popout';
import classes from './InfoTip.module.css';

/**
 * What a thing is, not what to type (that stays under the box). Opens on hover,
 * and a click or tap keeps it open, so it works on touch and from the keyboard.
 */
export function InfoTip({ about, children }: { about: string; children: ReactNode }) {
  return (
    <Popout
      label={`About ${about}`}
      className={classes.button}
      button={
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" />
          <circle cx="8" cy="4.75" r="0.9" fill="currentColor" />
          <path d="M8 7v5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      }
    >
      {children}
    </Popout>
  );
}
