import type { ReactNode } from 'react';
import { Link } from 'react-router';
import classes from './HubCard.module.css';

/**
 * One section on a hub: its title, a line saying whether it needs you to go
 * in ("3 organisers, 2 invites pending"), and at most one button, always at
 * the bottom. The whole card goes to the section's page, through its title,
 * which is the card's one link; the button, when there is one, sits above
 * that link and does its own thing. Nothing destructive and no form here:
 * those are inside the section.
 */
export function HubCard({
  title,
  to,
  children,
  action,
}: {
  title: string;
  to: string;
  /** The status line, or a few short lines. */
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={classes.card} aria-label={title}>
      <h2 className={classes.title}>
        <Link to={to} className={classes.link}>
          {title}
        </Link>
      </h2>
      <div className={classes.body}>{children}</div>
      {action !== undefined && <div className={classes.action}>{action}</div>}
    </section>
  );
}

/**
 * Cards of a hub in two or three columns of equal height, one on a narrow
 * screen. `four` lays a row of four out as four, where there is room, such
 * as the steps that build a task.
 */
export function CardGrid({
  children,
  label,
  four = false,
}: {
  children: ReactNode;
  label: string;
  four?: boolean;
}) {
  return (
    <div
      className={four ? `${classes.grid} ${classes.four}` : classes.grid}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}
