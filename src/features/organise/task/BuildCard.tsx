import type { ReactNode } from 'react';
import { useTaskParams } from '@/lib/route-params';
import { ReadOnlyAt } from '../ReadOnlyAt';
import classes from './task.module.css';

/**
 * One card that builds the task, on the task's page: a heading band with its
 * title and a line saying what it is for, then its parts. `id` is its anchor,
 * which the readiness row and a refused save's links scroll to.
 */
export function BuildCard({
  id,
  title,
  line,
  aside,
  children,
}: {
  id: string;
  title: string;
  line: ReactNode;
  /** What stands beside the title, such as the workflow's name. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const place = { kind: 'task' as const, ...useTaskParams() };
  return (
    <section id={id} className={classes.card} aria-label={title} data-card={id}>
      <header className={classes.band}>
        <div className={classes.bandText}>
          <h2 className={classes.cardTitle}>{title}</h2>
          <p className={classes.cardLine}>{line}</p>
        </div>
        <div className={classes.aside}>
          {' '}
          <ReadOnlyAt
            place={place}
            role={id === 'tests' || id === 'statement' ? 'admin' : 'manager'}
          />
          {aside}
        </div>
      </header>
      <div className={classes.cardBody}>{children}</div>
    </section>
  );
}

/**
 * A part of a card under its own small heading and line: more room between
 * parts than within them, so where one ends and the next begins shows.
 */
export function CardPart({
  title,
  line,
  children,
}: {
  title: string;
  line?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={classes.part} aria-label={title}>
      <h3 className={classes.partTitle}>{title}</h3>
      {line !== undefined && <p className={classes.partLine}>{line}</p>}
      {children}
    </section>
  );
}
