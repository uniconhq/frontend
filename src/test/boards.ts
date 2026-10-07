import type { Board, BoardCell, BoardRow, OrganisedBoard } from '@/api/types';

/** A row's cell on a task, counting nothing and never attempted unless told. */
export function cell(overrides: Partial<BoardCell> = {}): BoardCell {
  return {
    counting: false,
    numbers: {},
    attempts: 0,
    grading: null,
    submissions: null,
    ...overrides,
  };
}

/** A contestant's row, by user id and name. */
export function row(
  rank: number,
  user_id: number,
  name: string,
  keys: (string | null)[],
  cells: Record<string, BoardCell>,
): BoardRow {
  return { rank, row: { user_id, team: null, name }, keys, cells };
}

/**
 * An ICPC board over tasks A and B, as spec 1.7 serves one: solved count
 * then penalty with 20 minutes an attempt. kenny (7), the reader, is on it
 * with ada, tied with him on both keys, and carol below. B's `final` group
 * joins at the end.
 */
export function icpc(overrides: Partial<Board> = {}): Board {
  return {
    board: 'Standings',
    over: 'all',
    select: 'best',
    who: 'contestants',
    keys: [
      { by: 'points', better: 'higher', per_attempt: null },
      { by: 'penalty', better: 'lower', per_attempt: 20 },
    ],
    tasks: [
      { id: 'sum', label: 'A', worth: '1' },
      { id: 'max', label: 'B', worth: '1' },
    ],
    not_in_view: [
      {
        task: 'max',
        groups: ['final'],
        tests_of: [],
        shown_at: '2026-09-12T10:30:00Z',
      },
    ],
    rows: [
      row(1, 20, 'ada', ['1', '45'], {
        sum: cell({ counting: true, numbers: { points: '1', penalty: '45' } }),
        max: cell({ attempts: 2 }),
      }),
      row(1, 7, 'kenny', ['1', '45'], {
        sum: cell({
          counting: true,
          numbers: { points: '1', penalty: '45' },
          attempts: 1,
          grading: 0,
          submissions: [2],
        }),
        max: cell({ grading: 1, submissions: [] }),
      }),
      row(3, 30, 'carol', ['0', null], { sum: cell(), max: cell() }),
    ],
    shown_at: null,
    ...overrides,
  };
}

/** A board whose scope shows nothing until the reveal. */
export const hiddenUntilClose: Board = {
  board: 'Final',
  over: 'after_close',
  select: 'marked',
  who: 'contestants',
  keys: [],
  tasks: [],
  not_in_view: [],
  rows: [],
  shown_at: '2026-09-12T10:30:00Z',
};

/** A board as organisers read it, with nothing it asks left unmet. */
export function organised(now: Board, final: Board = now): OrganisedBoard {
  return { now, final, notes: [] };
}
