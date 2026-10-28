import type { ReactNode } from 'react';
import { Popout } from './Popout';
import classes from './InfoTip.module.css';

/**
 * Background for a field or a heading, behind a small ⓘ beside its label:
 * what a thing is, not what to type, which stays in plain sight under the
 * box. It opens on hover for a mouse, and on a click or a tap, which keeps it
 * open until the next click, a click elsewhere or Escape, so it works on a
 * touch screen and from the keyboard, where the ⓘ is a button like any other.
 * `about` names what it explains, for a screen reader: "About Worth".
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
