import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { formatExact } from '@/lib/exact';
import { classicMeanings } from '@/test/organiser';
import { renderWithProviders } from '@/test/render';
import { graded, grading, reported } from '@/test/contestant';
import { ScoredResult } from './ScoredResult';

/** Classic's values as its workflow names them, in its report order (M58). */
const MEANINGS = classicMeanings;

/**
 * A wrong answer on a task that folds its tests' times (#441): a test that
 * was not accepted has no value for any fold, so the run shows no overall
 * time, while each test's row keeps the time it reported.
 */
const wrong = grading({
  status: 'graded',
  outcome: 'wrong_answer',
  points: { shown: '50', pending: '0', pending_until: null },
  factor: '1',
  folded: {},
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

/** An accepted run on classic: its folds, its tests' values and its compile log. */
const right = grading({
  status: 'graded',
  outcome: 'accepted',
  points: { shown: '100', pending: '0', pending_until: null },
  factor: '1',
  // The folds as they arrive, memory before time.
  folded: { memory_kb: '10420', time_ms: '28' },
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

describe("a result's points", () => {
  it('are cut to two decimals, as every page shows them, the run’s and each group’s (R17)', () => {
    const third = grading({
      status: 'graded',
      outcome: 'wrong_answer',
      points: { shown: '36.666666', pending: '0', pending_until: null },
      factor: '1',
      folded: {},
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
        folded: {},
        groups: [],
      });
    const { unmount } = renderWithProviders(<ScoredResult grading={one('1')} />);
    expect(screen.getByText('1 point')).toBeVisible();
    unmount();
    renderWithProviders(<ScoredResult grading={one('1.0004')} />);
    expect(screen.getByText('1 point')).toBeVisible();
  });
});

describe("a result's values over its tests", () => {
  it('says nothing of a fold a wrong answer has no value for while the task names no values, each test keeping its own', () => {
    const { container } = renderWithProviders(<ScoredResult grading={wrong} />);

    expect(screen.queryByRole('definition')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Over the tests shown' })).toBeNull();
    expect(container).not.toHaveTextContent(/—/);
    const tests = screen.getByRole('table', { name: 'Tests main' });
    const [, first, second] = within(tests).getAllByRole('row');
    expect(first).toHaveTextContent('12');
    expect(second).toHaveTextContent('3');
  });

  it('says plainly why a wrong answer has no value over the tests shown (#441)', () => {
    renderWithProviders(<ScoredResult grading={{ ...wrong, meanings: MEANINGS }} />);

    expect(screen.queryByRole('group', { name: 'Over the tests shown' })).toBeNull();
    expect(
      screen.getByText(
        'Run time and memory used have no value while a test shown is not accepted.',
      ),
    ).toBeVisible();
    const tests = screen.getByRole('table', { name: 'Tests main' });
    const [, first] = within(tests).getAllByRole('row');
    expect(first).toHaveTextContent('12 ms');
  });

  it('shows the folds that have a value and says which has none', () => {
    renderWithProviders(
      <ScoredResult
        grading={{ ...wrong, meanings: MEANINGS, folded: { memory_kb: '2048' } }}
      />,
    );

    const over = screen.getByRole('group', { name: 'Over the tests shown' });
    expect(
      within(over)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['Memory used']);
    expect(over).not.toHaveTextContent('Run time');
    expect(
      screen.getByText('Run time has no value while a test shown is not accepted.'),
    ).toBeVisible();
  });

  it('labels the folds in the values’ words and the table’s order, each with its unit (M63)', () => {
    renderWithProviders(<ScoredResult grading={right} />);

    const over = screen.getByRole('group', { name: 'Over the tests shown' });
    expect(over).toHaveTextContent(
      `Over the tests shown:Run time28 ms (the longest),Memory used${formatExact('10420')} KB (the most)`,
    );
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
  });

  it('names a value by its key where its publication gives no title', () => {
    renderWithProviders(
      <ScoredResult
        grading={{
          ...right,
          meanings: MEANINGS.map((meaning) => ({
            ...meaning,
            title: null,
            unit: null,
          })),
        }}
      />,
    );

    const over = screen.getByRole('group', { name: 'Over the tests shown' });
    expect(
      within(over)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['time_ms', 'memory_kb']);
    expect(over).toHaveTextContent('time_ms28 (the most)');
  });
});
