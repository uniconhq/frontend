import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { TextInput as MantineTextInput } from '@mantine/core';
import { BodyText } from './BodyText';
import classes from './ListCard.module.css';

/** The rows the card shows before it scrolls, and past which it offers a filter. */
const SHOWN_ROWS = 6;

export type ListRow = {
  key: string;
  to: string;
  /** What the row is, such as a contest's name. */
  name: ReactNode;
  /** What it says about it, such as its state and its dates. */
  detail?: ReactNode;
  /** What a screen reader calls the row, when its name alone is not enough. */
  label?: string;
  /** What the filter matches it on. */
  text: string;
};

/**
 * The one list of orgs, of an org's contests and of a contest's tasks: as
 * tall as about six rows whatever the count, scrolling inside itself past
 * that, and growing instead on a narrow screen, where an inner scroll would
 * fight the page's. Each row goes to its page and says something about it.
 * With none, the space is left with one plain line; past six, a filter box
 * finds one by name. Its one button sits at the bottom, always in the same
 * place. `notice` is a line above the rows, for what the list cannot show.
 * `body`, when given, stands in for the rows, for a list still loading or
 * failed.
 */
export function ListCard({
  title,
  rows,
  empty,
  action,
  notice,
  body,
}: {
  title: string;
  rows: ListRow[];
  empty: string;
  action?: ReactNode;
  notice?: ReactNode;
  body?: ReactNode;
}) {
  const [filter, setFilter] = useState('');
  const filtering = rows.length > SHOWN_ROWS;
  const needle = filter.trim().toLowerCase();
  const shown =
    filtering && needle !== ''
      ? rows.filter((row) => row.text.toLowerCase().includes(needle))
      : rows;

  return (
    <section className={classes.card} aria-label={title}>
      <div className={classes.head}>
        <h2 className={classes.title}>{title}</h2>
        {filtering && body === undefined && (
          <MantineTextInput
            className={classes.filter}
            aria-label={`Filter ${title.toLowerCase()}`}
            placeholder="Filter by name"
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
            size="xs"
            radius="sm"
          />
        )}
      </div>
      {notice}
      <div className={classes.rows}>
        {body ??
          (rows.length === 0 ? (
            <BodyText tone="secondary">{empty}</BodyText>
          ) : shown.length === 0 ? (
            <BodyText tone="secondary">
              Nothing here matches “{filter.trim()}”.
            </BodyText>
          ) : (
            <ul className={classes.list} aria-label={title}>
              {shown.map((row) => (
                <li key={row.key} className={classes.row} aria-label={row.label}>
                  <Link to={row.to} className={classes.name}>
                    {row.name}
                  </Link>
                  {row.detail !== undefined && (
                    <div className={classes.detail}>{row.detail}</div>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </div>
      {action !== undefined && <div className={classes.action}>{action}</div>}
    </section>
  );
}
