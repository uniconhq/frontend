import type { ReactNode } from 'react';
import classes from './links.module.css';

/**
 * A link the browser follows out of the app: to Forgejo, or to a file the
 * backend serves. It looks like a link in the app, with an arrow after it
 * that says it leaves the page; the arrow is drawn by the stylesheet, so it
 * is not read out as part of the link's name. `newTab` opens it in a tab of
 * its own that is told nothing about this one, and `label` names it where
 * its text alone is shared by several links on the page.
 */
export function OutLink({
  href,
  children,
  newTab = false,
  label,
}: {
  href: string;
  children: ReactNode;
  newTab?: boolean;
  label?: string;
}) {
  return (
    <a
      href={href}
      className={`${classes.link} ${classes.out}`}
      aria-label={label}
      {...(newTab && { target: '_blank', rel: 'noopener noreferrer' })}
    >
      {children}
    </a>
  );
}
