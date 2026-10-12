import { Link } from 'react-router';
import type { ReactNode } from 'react';
import classes from './links.module.css';

/**
 * A link to another page of the app, followed by the router rather than by a
 * full page load: accent text, underlined on hover. It is the one look for
 * going somewhere in the app; something that does a thing is a Button, and a
 * link that leaves the app is an OutLink. `to` may be a search alone, such as
 * `?file=task.yaml`, which keeps the page and changes what it shows. `label`
 * names it where its text alone is one of several alike on the page.
 */
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
