import { useState, type ReactNode } from 'react';
import { Popover } from '@mantine/core';
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
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);

  return (
    <Popover
      opened={hovered || pinned}
      onClose={() => {
        setPinned(false);
        setHovered(false);
      }}
      position="top-start"
      width={300}
      withArrow
      shadow="md"
      returnFocus
    >
      <Popover.Target>
        <button
          type="button"
          className={classes.button}
          aria-label={`About ${about}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={() => setPinned((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setPinned(false);
              setHovered(false);
            }
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" />
            <circle cx="8" cy="4.75" r="0.9" fill="currentColor" />
            <path d="M8 7v5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </Popover.Target>
      <Popover.Dropdown
        className={classes.dropdown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {children}
      </Popover.Dropdown>
    </Popover>
  );
}
