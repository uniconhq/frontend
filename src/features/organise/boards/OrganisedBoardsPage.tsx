import { useSearchParams } from 'react-router';
import { $api, queryView } from '@/api/query';
import type { BoardRow, OrganisedBoard } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Card } from '@/ui/Card';
import { PageLink } from '@/ui/PageLink';
import { PageTitle } from '@/ui/PageTitle';
import { Select } from '@/ui/Select';
import { BoardTable } from '@/ui/boards/BoardTable';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { contestPath } from '@/lib/organiser-paths';
import { useContestParams } from '@/lib/route-params';
import classes from '../organise.module.css';

/** Read again now and then, since a board is computed from what is graded and shown. */
const MEANWHILE_MS = 30_000;

/**
 * The row picked to read `now` as, kept in the page's address as `row`: a
 * contestant as `user:<id>`, a team as `team:<id>`.
 */
const ROW_PARAM = 'row';

type Picked = { user_id: number } | { team: string };

function pickedOf(search: URLSearchParams): Picked | null {
  const value = search.get(ROW_PARAM);
  if (value === null) return null;
  const [kind, id = ''] = value.split(':', 2);
  if (kind === 'user' && /^[1-9]\d{0,9}$/.test(id)) return { user_id: Number(id) };
  if (kind === 'team' && id !== '') return { team: id };
  return null;
}

function rowValue(row: BoardRow): string {
  return row.row.team !== null
    ? `team:${row.row.team}`
    : `user:${String(row.row.user_id)}`;
}

/** Every row any board lists in its final state, once each, by name. */
function rowChoices(boards: OrganisedBoard[]): { value: string; label: string }[] {
  const named = new Map<string, string>();
  for (const board of boards) {
    for (const row of board.final.rows) {
      named.set(rowValue(row), row.row.name === '' ? rowValue(row) : row.row.name);
    }
  }
  return [...named]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * One board as organisers read it: `now`, exactly what its audience is
 * given, every row unless a row is picked, then as that row sees it; and
 * `final`, as it will read once every task has revealed. What `now` does not
 * count yet is listed with when contestants get it. What the board asks of
 * its tasks that does not hold is said above both.
 */
function Organised({ board, picked }: { board: OrganisedBoard; picked: boolean }) {
  const name = board.final.board;
  return (
    <Card>
      <div className={classes.stack}>
        {board.notes.length > 0 && (
          <div className={classes.panel} role="note" aria-label={`Notes on ${name}`}>
            <ul className={classes.named}>
              {board.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
        <BoardTable
          board={board.now}
          title={`${name} now`}
          everyRow={!picked}
          ownLabel="The row picked"
        />
        <BoardTable board={board.final} title={`${name} final`} everyRow />
      </div>
    </Card>
  );
}

/**
 * Every board of the contest whatever its `who` and `rows`, for anyone with
 * the observer role at it, each `now` and `final`, with a row to read `now`
 * as, kept in the address. Nothing is computed again for the pick: `now`
 * cut to that row is exactly the board its contestant is given.
 */
export function OrganisedBoardsPage() {
  const { org, contest } = useContestParams();
  const [search, setSearch] = useSearchParams();
  const picked = pickedOf(search);
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/organise/boards',
      { params: { path: { org, contest }, query: picked ?? {} } },
      { refetchInterval: MEANWHILE_MS },
    ),
  );

  const pick = (value: string) => {
    const next = new URLSearchParams(search);
    if (value === '') next.delete(ROW_PARAM);
    else next.set(ROW_PARAM, value);
    setSearch(next);
  };

  return (
    <div className={classes.page}>
      <PageLink to={contestPath(org, contest)}>Back to the contest</PageLink>
      <PageTitle>Boards</PageTitle>
      {view.state === 'loading' && <PageSkeleton rows={4} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' &&
        (view.data.length === 0 ? (
          <BodyText tone="secondary">This contest has no boards.</BodyText>
        ) : (
          <>
            <div className={classes.form}>
              <Select
                label="Read now as"
                value={search.get(ROW_PARAM) ?? ''}
                options={rowChoices(view.data)}
                placeholder="Every row"
                description="Shows each board's now as this row is given it."
                onChange={pick}
              />
            </div>
            {view.data.map((board) => (
              <Organised
                key={board.final.board}
                board={board}
                picked={picked !== null}
              />
            ))}
          </>
        ))}
    </div>
  );
}
