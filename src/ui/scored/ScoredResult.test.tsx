import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { OnBoard } from '@/api/types';
import { formatExact } from '@/lib/exact';
import { formatDateTime } from '@/lib/time';
import { classicMeanings } from '@/test/organiser';
import { renderWithProviders } from '@/test/render';
import { graded, grading, reported } from '@/test/contestant';
import { ScoredResult } from './ScoredResult';

/** Classic's values as its workflow names them, in its report order (M58). */
const MEANINGS = classicMeanings;

const REVEAL = '2026-09-26T15:00:00Z';

/**
 * A wrong answer on classic: a test that was not accepted, while each
 * test's row keeps the time it reported (#441).
 */
const wrong = grading({
  status: 'graded',
  outcome: 'wrong_answer',
  points: { shown: '50', pending: '0', pending_until: null },
  factor: '1',
  groups: [
    {
      group: 'main',
      show: 'always',
      outcome: 'wrong_answer',
      tests: [
        graded('main/1', 'accepted', reported({ time_ms: '12' }), '1'),
        graded('main/2', 'wrong_answer', reported({ time_ms: '3' }), '0'),
      ],
      shown_at: null,
      ran: true,
      points: '50',
      max: '100',
    },
  ],
});

/** An accepted run on classic: its tests' values and its compile log. */
const right = grading({
  status: 'graded',
  outcome: 'accepted',
  points: { shown: '100', pending: '0', pending_until: null },
  factor: '1',
  values: reported({}, { log: 'Compiled cleanly.' }),
  meanings: MEANINGS,
  groups: [
    {
      group: 'main',
      show: 'always',
      outcome: 'accepted',
      tests: [
        graded('main/1', 'accepted', reported({ memory_kb: '10420', time_ms: '28' })),
      ],
      shown_at: null,
      ran: true,
      points: '100',
      max: '100',
    },
  ],
});

const POINTS = { by: 'points', fold: null, title: null, unit: null };
const SLOWEST = { by: 'time_ms', fold: 'max' as const, title: 'Run time', unit: 'ms' };

function line(overrides: Partial<OnBoard>): OnBoard {
  return {
    board: 'Standings',
    over: 'all',
    numbers: [{ ...POINTS, value: '24' }],
    pending: '0',
    shown_at: null,
    counted: false,
    ...overrides,
  };
}

describe("a result's points", () => {
  it('are cut to two decimals, as every page shows them, the run’s and each group’s (R17)', () => {
    const third = grading({
      status: 'graded',
      outcome: 'wrong_answer',
      points: { shown: '36.666666', pending: '0', pending_until: null },
      factor: '1',
      groups: [
        {
          group: 'main',
          show: 'always',
          outcome: 'wrong_answer',
          tests: [graded('main/1', 'accepted', reported({}), '1')],
          shown_at: null,
          ran: true,
          points: '36.666666',
          max: '110',
        },
      ],
    });
    renderWithProviders(<ScoredResult grading={third} />);
    expect(screen.getByText(`${formatExact('36.66', 2)} points`)).toBeVisible();
    expect(
      screen.getByText(`${formatExact('36.66', 2)} / 110 points`, { exact: false }),
    ).toBeVisible();
    expect(screen.queryByText(/36[.,]67/)).toBeNull();
  });

  it('read "1 point" for one, and for points that are cut to one', () => {
    const one = (shown: string) =>
      grading({
        status: 'graded',
        outcome: 'accepted',
        points: { shown, pending: '0', pending_until: null },
        factor: '1',
        groups: [],
      });
    const { unmount } = renderWithProviders(<ScoredResult grading={one('1')} />);
    expect(screen.getByText('1 point')).toBeVisible();
    unmount();
    renderWithProviders(<ScoredResult grading={one('1.0004')} />);
    expect(screen.getByText('1 point')).toBeVisible();
  });
});

describe("a result's values", () => {
  it('keeps each test’s own values, in the values’ words and the table’s order', () => {
    renderWithProviders(<ScoredResult grading={right} />);

    const tests = screen.getByRole('table', { name: 'Tests main' });
    expect(
      within(tests)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Test', 'Outcome', 'Run time', 'Memory used']);
    expect(within(tests).getAllByRole('row')[1]).toHaveTextContent(
      `28 ms${formatExact('10420')} KB`,
    );
    expect(screen.getByLabelText('Compile log')).toHaveTextContent('Compiled cleanly.');
    expect(screen.queryByText(/time_ms|memory_kb/)).toBeNull();
    expect(screen.queryByText(/Over the tests shown/)).toBeNull();
  });
});

describe('a result on the leaderboards', () => {
  it('reads one line per board, its points, what may still come and whether it counts', () => {
    renderWithProviders(
      <ScoredResult
        grading={{
          ...right,
          boards: [
            line({ pending: '56', counted: true }),
            line({ board: 'Public', over: 'live' }),
          ],
        }}
      />,
    );

    const boards = screen.getByRole('region', { name: 'On the leaderboards' });
    expect(
      within(boards)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Standings: 24 points · up to 56 more at the reveal · counts here',
      'Public: 24 points',
    ]);
  });

  it('labels a value by its title and how the board combines its tests, or says it has none', () => {
    renderWithProviders(
      <ScoredResult
        grading={{
          ...wrong,
          boards: [
            line({ board: 'Fastest', numbers: [{ ...SLOWEST, value: '15' }] }),
            line({
              board: 'Total',
              numbers: [{ ...SLOWEST, fold: 'sum', value: null }],
            }),
          ],
        }}
      />,
    );

    const boards = screen.getByRole('region', { name: 'On the leaderboards' });
    expect(boards).toHaveTextContent('Fastest: Run time, highest: 15 ms');
    expect(boards).toHaveTextContent('Total: Run time, total: no value');
  });

  it('shares a line between boards that read alike, and says when a board shows nothing yet', () => {
    renderWithProviders(
      <ScoredResult
        grading={{
          ...right,
          boards: [
            line({ counted: true }),
            line({ board: 'Mirror', counted: true }),
            line({ board: 'Final', over: 'after_close', shown_at: REVEAL }),
          ],
        }}
      />,
    );

    const items = within(
      screen.getByRole('region', { name: 'On the leaderboards' }),
    ).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Standings, Mirror: 24 points · counts here',
      `Final: shown at ${formatDateTime(new Date(REVEAL))}`,
    ]);
  });

  it('says nothing where no board covers the task', () => {
    renderWithProviders(<ScoredResult grading={right} />);
    expect(screen.queryByRole('region', { name: 'On the leaderboards' })).toBeNull();
  });
});
