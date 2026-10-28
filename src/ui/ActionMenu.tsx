import { Fragment, memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Menu } from '@mantine/core';
import { Button } from './Button';
import classes from './ActionMenu.module.css';

/**
 * A menu of actions behind a button: headings, dividers and items, an item
 * that cannot be chosen shown with the reason it cannot. The workflow
 * editor's ports use it, behind
 * a small plain button, as the keyboard's way to do what a drag does; a
 * step's drawer uses it behind a page's button (`button`).
 *
 * `entries` may be a function, called only while the menu is open: a graph
 * draws a menu on every port, and building every one's entries, and drawing
 * every menu again, on each change made the editor slow. A menu whose
 * entries are a function is drawn again only when its button's words change
 * or it opens, and reads the entries as they are then.
 */
export type MenuEntry =
  | { kind: 'heading'; text: string }
  | {
      kind: 'item';
      text: string;
      reason?: string | null;
      onSelect: () => void;
    }
  | { kind: 'divider' };

type Props = {
  /** What the button shows. */
  text: string;
  className?: string;
  /** What the button and the menu are called for a screen reader. */
  label: string;
  entries: MenuEntry[] | (() => MenuEntry[]);
  /** The button is a page's secondary Button rather than a small plain one. */
  button?: boolean;
};

export function ActionMenu({ entries, ...rest }: Props) {
  // The latest entries, read when the menu opens, so a menu drawn once
  // still offers what holds now.
  const latest = useRef(entries);
  useLayoutEffect(() => {
    latest.current = entries;
  });
  const read = useCallback(
    () => (typeof latest.current === 'function' ? latest.current() : latest.current),
    [],
  );
  return (
    <DrawnMenu
      {...rest}
      read={read}
      entries={typeof entries === 'function' ? null : entries}
    />
  );
}

const DrawnMenu = memo(function DrawnMenu({
  text,
  label,
  read,
  className,
  button = false,
}: Omit<Props, 'entries'> & {
  read: () => MenuEntry[];
  /** The entries when they are a list, so a new list draws the menu again. */
  entries: MenuEntry[] | null;
}) {
  const [opened, setOpened] = useState(false);
  const entries = opened ? read() : [];
  return (
    <Menu
      position="bottom-start"
      withinPortal
      shadow="md"
      width={button ? 380 : 300}
      opened={opened}
      onChange={setOpened}
    >
      <Menu.Target>
        {button ? (
          <Button variant="secondary" label={label === text ? undefined : label}>
            {text}
          </Button>
        ) : (
          <button
            type="button"
            className={`${className ?? classes.button} nodrag nopan`}
            aria-label={label}
          >
            {text}
          </button>
        )}
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
                <span className={button ? classes.menuTitle : classes.menuText}>
                  {entry.text}
                </span>
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
});
