import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { TextInput as MantineTextInput } from '@mantine/core';
import { BodyText } from './BodyText';
import classes from './ListCard.module.css';

/** The rows the card shows before it scrolls, and past which it offers a filter. */
const SHOWN_ROWS = 6;

export type ListRow = {
  key: string;
  to: string;
  name: ReactNode;
  detail?: ReactNode;
  /** What a screen reader calls the row, when its name alone is not enough. */
  label?: string;
  /** What the filter matches it on. */
  text: string;
  /** A small button for the row itself, such as editing it, kept above its link. */
  action?: ReactNode;
};

/** Whether the rows' box has more below, kept up to date as it scrolls or resizes. */
function useMoreBelow(count: number, body: ReactNode) {
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const element = box.current;
    if (element === null) return;
    setMore(element.scrollTop + element.clientHeight < element.scrollHeight - 1);
  }, []);
  useLayoutEffect(measure, [measure, count, body]);
  useEffect(() => {
    const element = box.current;
    if (element === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild !== null) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [measure, count, body]);
  return { box, more, measure };
}

/**
 * The one list of orgs, contests, tasks and workflows. Past six rows it
 * scrolls and offers a filter. `body` stands in for the rows while loading or failed.
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
  const { box, more, measure } = useMoreBelow(shown.length, body);

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
      <div
        ref={box}
        className={classes.rows}
        data-more={more ? '' : undefined}
        onScroll={measure}
      >
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
                  {row.action !== undefined && (
                    <div className={classes.rowAction}>{row.action}</div>
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
