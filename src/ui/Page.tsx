import { Group } from '@mantine/core';
import type { ReactNode } from 'react';
import { PageTitle } from './PageTitle';
import classes from './Page.module.css';

/** A page's frame: its parts one under the other, full width. A form narrows itself, not the page. */
export function Page({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className={classes.page} aria-label={label}>
      {children}
    </div>
  );
}

/**
 * A page's header: its title, a line of what stands out about it (a state, a
 * countdown), a short description, and the page's links on the right, such
 * as "View as an entrant" or a small "Edit". Links only: a page's header goes
 * places, its actions sit with what they act on.
 */
export function PageHeader({
  title,
  meta,
  links,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  links?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={classes.header}>
      <div className={classes.heading}>
        <PageTitle>{title}</PageTitle>
        {meta !== undefined && <Group gap="8px 16px">{meta}</Group>}
        {children}
      </div>
      {links !== undefined && <div className={classes.links}>{links}</div>}
    </header>
  );
}
