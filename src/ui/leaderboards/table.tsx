import type { components } from '@/api/schema';
import { formatExact } from '@/lib/exact';
import { formatDateTime } from '@/lib/time';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { ShownValue } from '@/ui/number/ShownValue';
import { MISSING, PARTIAL_ORDER, gradingCount, heldCount } from '@/ui/number/words';
import classes from './table.module.css';

type Leaderboard = components['schemas']['Leaderboard'];
type Header = components['schemas']['Header'];
type Counted = components['schemas']['Counted'];

/**
 * One leaderboard as the caller is shown it. Places are the server's,
 * shared by ties. A dropped sort key leaves the order partial and shows
 * no place. Bounds and a self-reported mark sit on the header. A cell
 * links the submissions it counted, and those still being checked, when
 * the caller is given them.
 */
export function LeaderboardTable({
  board,
  submissionTo,
  staff = false,
}: {
  board: Leaderboard;
  /** The address of one counted submission of a row's entrant, when the caller can open it. */
  submissionTo?: (task: string, number: number, entrant: string) => string;
  /** Bounds are staff only. A self-reported mark is on the header for everyone. */
  staff?: boolean;
}) {
  const partial = board.dropped.length > 0;
  return (
    <div className={classes.board}>
      <table className={classes.table} aria-label={board.title || board.key}>
        <caption className={classes.caption}>{board.title || board.key}</caption>
        <thead>
          <tr>
            <th>Place</th>
            <th>Entrant</th>
            {board.headers.map((header) => (
              <th key={header.name}>
                {header.name}
                <HeaderNotes header={header} staff={staff} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row) => (
            <tr key={row.row.entrant}>
              <td>{partial || row.place === null ? MISSING : String(row.place)}</td>
              <td>
                {row.row.name === '' ? MISSING : row.row.name}
                {row.held > 0 ? ` ${heldCount(row.held)}` : ''}
                {row.grading !== null && row.grading > 0
                  ? ` ${gradingCount(row.grading)}`
                  : ''}
              </td>
              {board.headers.map((header) => {
                const cell = row.cells.find((item) => item.column === header.name);
                return (
                  <td key={header.name}>
                    <ShownValue
                      number={cell?.number ?? null}
                      text={cell?.text}
                      hidden={cell?.hidden ?? false}
                      decimals={header.decimals ?? undefined}
                    />
                    <CountedLinks
                      counted={cell?.counted ?? null}
                      entrant={row.row.entrant}
                      submissionTo={submissionTo}
                    />
                    <CountedLinks
                      counted={cell?.waiting ?? null}
                      entrant={row.row.entrant}
                      submissionTo={submissionTo}
                      waiting
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {partial && <BodyText>{PARTIAL_ORDER}</BodyText>}
      {board.held_from !== null && (
        <BodyText>Held from {formatDateTime(new Date(board.held_from))}.</BodyText>
      )}
      {board.rows.length === 0 && <BodyText tone="secondary">No rows.</BodyText>}
    </div>
  );
}

function HeaderNotes({ header, staff }: { header: Header; staff: boolean }) {
  const bounds = staff
    ? [
        header.at_least === null ? null : `at least ${formatExact(header.at_least)}`,
        header.at_most === null ? null : `at most ${formatExact(header.at_most)}`,
      ].filter((item) => item !== null)
    : [];
  return (
    <>
      {bounds.length > 0 && <span className={classes.note}>{bounds.join(', ')}</span>}
      {header.self_reported.length > 0 && (
        <span className={classes.note}>Self-reported</span>
      )}
    </>
  );
}

function CountedLinks({
  counted,
  entrant,
  submissionTo,
  waiting = false,
}: {
  counted: Counted[] | null;
  entrant: string;
  submissionTo?: (task: string, number: number, entrant: string) => string;
  waiting?: boolean;
}) {
  if (counted === null || counted.length === 0 || submissionTo === undefined)
    return null;
  return (
    <span className={classes.links}>
      {counted.map((item) => (
        <PageLink
          key={`${item.task}:${String(item.number)}`}
          to={submissionTo(item.task, item.number, entrant)}
        >
          {waiting
            ? `Submission ${String(item.number)}, being checked`
            : `Submission ${String(item.number)}`}
        </PageLink>
      ))}
    </span>
  );
}
