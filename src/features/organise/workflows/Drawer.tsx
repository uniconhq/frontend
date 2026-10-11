import { useEffect, useRef, type ReactNode } from 'react';
import classes from './workflows.module.css';

/** How wide the drawer is, which the graph keeps clear of the box it shows. */
export const DRAWER_WIDTH = 440;

/**
 * The selected box's drawer, from the right, over the graph (M37): what a
 * step, the inputs, a test's files or the report hold, to change. It is not
 * modal: the graph stays live beside it, so choosing another box shows that
 * one instead. It closes with its × or with Escape, unless Escape is for a
 * menu or a dialog open over it. Opening moves the focus to its title, and
 * closing gives it back to where it was, so the keyboard does not lose its
 * place.
 */
export function Drawer({
  title,
  onClose,
  children,
}: {
  /** What it shows; null while it is closed. */
  title: string | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const before = useRef<Element | null>(null);
  const open = title !== null;

  useEffect(() => {
    if (!open) return;
    before.current = document.activeElement;
    heading.current?.focus();
    return () => {
      const back = before.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('[role="menu"], [role="listbox"], [role="dialog"]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <aside
      className={classes.drawer}
      aria-label={title}
      style={{ width: DRAWER_WIDTH }}
    >
      <div className={classes.drawerHead}>
        <h2 className={classes.drawerTitle} ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button
          type="button"
          className={classes.drawerClose}
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className={classes.drawerBody}>{children}</div>
    </aside>
  );
}
