import type { ReactNode } from 'react';
import classes from './links.module.css';

/** A link out of the app: to Forgejo, or to a file the backend serves. */
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
