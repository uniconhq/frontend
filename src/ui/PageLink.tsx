import { Link } from 'react-router';
import type { ReactNode } from 'react';
import classes from './links.module.css';

/** A link within the app; `to` may be a search alone, such as `?file=task.yaml`. */
export function PageLink({
  to,
  children,
  label,
}: {
  to: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <Link to={to} className={classes.link} aria-label={label}>
      {children}
    </Link>
  );
}
