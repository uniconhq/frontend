import { Fragment } from 'react';
import { Menu } from '@mantine/core';
import classes from './ActionMenu.module.css';

/**
 * A menu of actions behind a small button: headings, dividers and items, an
 * item that cannot be chosen shown with the reason it cannot. The workflow
 * editor's ports use it as the keyboard's way to do what a drag does.
 */
export type MenuEntry =
  | { kind: 'heading'; text: string }
  | { kind: 'item'; text: string; reason?: string | null; onSelect: () => void }
  | { kind: 'divider' };

export function ActionMenu({
  text,
  label,
  entries,
  className,
}: {
  /** What the button shows. */
  text: string;
  className?: string;
  /** What the button is called for a screen reader: the port and its box. */
  label: string;
  entries: MenuEntry[];
}) {
  return (
    <Menu position="bottom-start" withinPortal shadow="md" width={300}>
      <Menu.Target>
        <button
          type="button"
          className={`${className ?? classes.button} nodrag nopan`}
          aria-label={label}
        >
          {text}
        </button>
      </Menu.Target>
      <Menu.Dropdown aria-label={label} className={classes.menu}>
        {entries.map((entry, at) => (
          <Fragment key={`${entry.kind} ${String(at)}`}>
            {entry.kind === 'heading' && <Menu.Label>{entry.text}</Menu.Label>}
            {entry.kind === 'divider' && <Menu.Divider />}
            {entry.kind === 'item' && (
              <Menu.Item
                disabled={entry.reason !== undefined && entry.reason !== null}
                onClick={entry.onSelect}
                title={entry.reason ?? undefined}
              >
                <span className={classes.menuText}>{entry.text}</span>
                {entry.reason !== undefined && entry.reason !== null && (
                  <span className={classes.menuReason}>{entry.reason}</span>
                )}
              </Menu.Item>
            )}
          </Fragment>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
