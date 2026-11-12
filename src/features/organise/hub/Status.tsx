import type { ReactNode } from 'react';
import { PageLink } from '@/ui/PageLink';
import classes from './status.module.css';

/** One thing a place needs, done or not, linking to where it is done. */
export type Check = {
  key: string;
  ok: boolean;
  /** Only a warning: nothing waits on it. */
  warning?: boolean;
  text: string;
  to: string;
};

function Mark({ check }: { check: Check }) {
  if (check.ok)
    return (
      <span role="img" aria-label="Done">
        ✓
      </span>
    );
  return check.warning === true ? (
    <span role="img" aria-label="Worth doing">
      !
    </span>
  ) : (
    <span role="img" aria-label="To do">
      ✗
    </span>
  );
}

export function Checklist({ label, checks }: { label: string; checks: Check[] }) {
  return (
    <ul className={classes.checklist} aria-label={label}>
      {checks.map((check) => (
        <li key={check.key}>
          <Mark check={check} />
          <PageLink to={check.to}>{check.text}</PageLink>
        </li>
      ))}
    </ul>
  );
}

/** The box under a page's title that says where the place stands. */
export function StatusBox({
  field,
  children,
}: {
  /** The field a link to it opens, as `data-field` marks it. */
  field?: string;
  children: ReactNode;
}) {
  return (
    <section className={classes.status} aria-label="Status" data-field={field}>
      {children}
    </section>
  );
}

/** A few facts side by side, each under its name. */
export function Summary({
  label,
  items,
}: {
  label: string;
  items: { term: string; value: ReactNode }[];
}) {
  return (
    <dl className={classes.summary} aria-label={label}>
      {items.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
