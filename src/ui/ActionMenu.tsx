import { Fragment } from 'react';
import { Menu } from '@mantine/core';
import { Button } from './Button';
import classes from './ActionMenu.module.css';

/**
 * A menu of actions behind a button: headings, dividers and items, an item
 * that cannot be chosen shown with the reason it cannot. An item may carry a
 * line saying what it is and a small note, such as a primitive's
 * description and its reference. The workflow editor's ports use it, behind
 * a small plain button, as the keyboard's way to do what a drag does; its
 * toolbar's "Add step" uses it behind a page's button (`button`).
 */
export type MenuEntry =
  | { kind: 'heading'; text: string }
  | {
      kind: 'item';
      text: string;
      reason?: string | null;
      /** A line under the item's text, saying what it is. */
      detail?: string | null;
      /** A small note under that, such as a reference. */
      note?: string;
      onSelect: () => void;
    }
  | { kind: 'divider' };

export function ActionMenu({
  text,
  label,
  entries,
  className,
  button = false,
  disabled = false,
  empty,
}: {
  /** What the button shows. */
  text: string;
  className?: string;
  /** What the button and the menu are called for a screen reader. */
  label: string;
  entries: MenuEntry[];
  /** The button is a page's secondary Button rather than a small plain one. */
  button?: boolean;
  disabled?: boolean;
  /** What the menu says when it has no entries. */
  empty?: string;
}) {
  return (
    <Menu position="bottom-start" withinPortal shadow="md" width={button ? 380 : 300}>
      <Menu.Target>
        {button ? (
          <Button
            variant="secondary"
            disabled={disabled}
            label={label === text ? undefined : label}
          >
            {text}
          </Button>
        ) : (
          <button
            type="button"
            className={`${className ?? classes.button} nodrag nopan`}
            aria-label={label}
            disabled={disabled}
          >
            {text}
          </button>
        )}
      </Menu.Target>
      <Menu.Dropdown aria-label={label} className={classes.menu}>
        {entries.length === 0 && empty !== undefined && (
          <Menu.Label>{empty}</Menu.Label>
        )}
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
                <span className={button ? classes.menuTitle : classes.menuText}>
                  {entry.text}
                </span>
                {entry.detail !== undefined && entry.detail !== null && (
                  <span className={classes.menuDetail}>{entry.detail}</span>
                )}
                {entry.note !== undefined && (
                  <span className={classes.menuNote}>{entry.note}</span>
                )}
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
