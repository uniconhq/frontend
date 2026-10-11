import type { ReactNode } from 'react';
import { PageTitle } from './PageTitle';
import classes from './Page.module.css';

/**
 * Every page's frame: its parts one under the other, as wide as the room
 * beside the sidebar, so every page's right edge is in the same place. A page
 * that wants a narrow column, such as a form, narrows its form, not itself.
 */
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
        {meta !== undefined && <div className={classes.meta}>{meta}</div>}
        {children}
      </div>
      {links !== undefined && <div className={classes.links}>{links}</div>}
    </header>
  );
}
