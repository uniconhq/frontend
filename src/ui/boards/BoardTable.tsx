import type { ReactNode } from 'react';
import type { Board, BoardRow } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { formatExact } from '@/lib/exact';
import { formatDateTime } from '@/lib/time';
import { cellLines, cellPlaces, gradingText, keyLabel, keyPlaces } from './board-text';
import classes from './boards.module.css';

/** What a row is called: a team's own name or a contestant's username. */
function rowName(row: BoardRow): string {
  if (row.row.name !== '') return row.row.name;
  return row.row.team !== null ? 'A team' : `Contestant ${String(row.row.user_id)}`;
}

/**
 * Only the reader's own row carries how many of its submissions are still
 * grading, so the row that has it is theirs. Organisers get it on every row.
 */
function isOwn(row: BoardRow): boolean {
  return Object.values(row.cells).some((cell) => cell.grading !== null);
}

/**
 * Per task, what is in the board's scope and not in its numbers yet, with
 * when it joins: the groups whose verdict is not shown, and, on a board that
 * ranks a value, the groups whose tests are not.
 */
function NotInView({ board }: { board: Board }) {
  if (board.not_in_view.length === 0) return null;
  const labels = new Map(board.tasks.map((task) => [task.id, task.label]));
  return (
    <div>
      <BodyText tone="secondary">Not counted yet:</BodyText>
      <ul className={classes.pending} aria-label="Not counted yet">
        {board.not_in_view.map((pending) => {
          const label = labels.get(pending.task) ?? pending.task;
          const at = formatDateTime(new Date(pending.shown_at));
          const parts = [
            ...(pending.groups.length > 0
              ? [`${pending.groups.join(', ')} of ${label}`]
              : []),
            ...(pending.tests_of.length > 0
              ? [`the tests of ${pending.tests_of.join(', ')} of ${label}`]
              : []),
          ];
          return (
            <li key={pending.task}>
              {parts.join(' and ')}, from {at}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * One board as its reader is given it: rows in rank order, tied rows under
 * one rank, each with its number on every key it is ranked on and its cell
 * on every task. Numbers are rounded for reading, with more digits where
 * two rows next to each other would show alike. The reader's own row also
 * says how many of its submissions are still grading and which it counts,
 * each a link where `submissionTo` gives one, and is marked `ownLabel`.
 * `everyRow` is for organisers, whose rows all carry that, so none is marked.
 * A board whose scope shows nothing yet reads "Shown from" its time, or, with
 * none of its tasks released and so no time to name, says that. `title`
 * names the board's heading and table, its name unless given.
 */
export function BoardTable({
  board,
  title = board.board,
  everyRow = false,
  ownLabel = 'You',
  submissionTo,
}: {
  board: Board;
  title?: string;
  everyRow?: boolean;
  ownLabel?: string;
  submissionTo?: (task: string, number: number) => string;
}) {
  const link = (task: string, number: number): ReactNode =>
    submissionTo === undefined ? (
      `#${number}`
    ) : (
      <PageLink to={submissionTo(task, number)} mono>
        #{number}
      </PageLink>
    );

  if (board.nothing_shown) {
    return (
      <section className={classes.board} aria-label={title}>
        <SectionTitle>{title}</SectionTitle>
        <BodyText tone="secondary">
          {board.shown_at === null
            ? 'None of the tasks on this board is released yet.'
            : `Shown from ${formatDateTime(new Date(board.shown_at))}.`}
        </BodyText>
      </section>
    );
  }

  const places = keyPlaces(board);
  const taskPlaces = Object.fromEntries(
    board.tasks.map((task) => [task.id, cellPlaces(board, task.id)]),
  );

  return (
    <section className={classes.board} aria-label={title}>
      <SectionTitle>{title}</SectionTitle>
      <NotInView board={board} />
      {board.rows.length === 0 ? (
        <BodyText tone="secondary">Nobody is on this board yet.</BodyText>
      ) : (
        <div className={classes.scroll}>
          <table className={classes.table} aria-label={title}>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Name</th>
                {board.keys.map((key) => (
                  <th scope="col" key={key.by}>
                    {keyLabel(key)}
                  </th>
                ))}
                {board.tasks.map((task) => (
                  <th scope="col" key={task.id} title={task.id}>
                    {task.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row) => {
                const own = !everyRow && isOwn(row);
                return (
                  <tr
                    key={`${String(row.row.user_id)}-${String(row.row.team)}`}
                    className={own ? classes.own : undefined}
                    aria-current={own ? 'true' : undefined}
                  >
                    <td className={classes.number}>{row.rank}</td>
                    <th scope="row">
                      {rowName(row)}
                      {own && <BodyText tone="secondary">{ownLabel}</BodyText>}
                    </th>
                    {board.keys.map((key, index) => {
                      const exact = row.keys[index] ?? null;
                      return (
                        <td key={key.by} className={classes.number}>
                          {exact === null ? '—' : formatExact(exact, places[index])}
                        </td>
                      );
                    })}
                    {board.tasks.map((task) => {
                      const cell = row.cells[task.id];
                      if (cell === undefined) return <td key={task.id}>—</td>;
                      const grading =
                        cell.grading === null ? null : gradingText(cell.grading);
                      return (
                        <td key={task.id}>
                          <div
                            className={
                              cell.counting
                                ? classes.cell
                                : `${classes.cell} ${classes.idle}`
                            }
                          >
                            {cellLines(board.keys, cell, taskPlaces[task.id] ?? {}).map(
                              (line) => (
                                <span key={line}>{line}</span>
                              ),
                            )}
                            {grading !== null && <span>{grading}</span>}
                            {cell.submissions !== null &&
                              cell.submissions.length > 0 && (
                                <span>
                                  Counts{' '}
                                  {cell.submissions.map((number, at) => (
                                    <span key={number}>
                                      {at > 0 && ', '}
                                      {link(task.id, number)}
                                    </span>
                                  ))}
                                </span>
                              )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
