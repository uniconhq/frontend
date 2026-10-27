import { formatExact } from '@/lib/exact';
import { BEING_CHECKED, MISSING } from './words';
import classes from './number.module.css';

/**
 * One value or one leaderboard cell, as every page shows it: a number
 * rounded, its exact digits on hover; text as given, on one line; "–" when
 * it is missing or hidden; "being checked" while it waits.
 */
export function ShownValue({
  number,
  text = null,
  waiting = false,
  hidden = false,
  decimals,
}: {
  number: string | null;
  text?: string | null;
  waiting?: boolean;
  hidden?: boolean;
  /** Decimals to round a number to. A leaderboard passes its column's. */
  decimals?: number;
}) {
  if (hidden) return <span>{MISSING}</span>;
  if (waiting) return <span>{BEING_CHECKED}</span>;
  if (number !== null) {
    const shown = formatExact(number, decimals);
    return <span title={shown === number ? undefined : number}>{shown}</span>;
  }
  if (text !== null) {
    return (
      <span className={classes.line} title={text}>
        {text}
      </span>
    );
  }
  return <span>{MISSING}</span>;
}
