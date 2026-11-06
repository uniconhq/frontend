import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import classes from './workflows.module.css';

/** The graph keeps this width clear of the box the drawer shows. */
export const DRAWER_WIDTH = 440;

/** Not modal (M37): the graph stays live beside it. It starts below the bar, so Save is never under it. */
export function Drawer({
  title,
  onClose,
  children,
}: {
  title: string | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const before = useRef<Element | null>(null);
  const open = title !== null;
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const bar = document.querySelector('[data-workflow-bar]');
      setTop(bar === null ? 0 : Math.max(0, bar.getBoundingClientRect().bottom));
    };
    place();
    window.addEventListener('scroll', place, { capture: true, passive: true });
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
    };
  }, [open]);

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
      style={{ width: DRAWER_WIDTH, top }}
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
