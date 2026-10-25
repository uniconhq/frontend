import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { formatExact } from '@/lib/exact';
import { classicMeanings } from '@/test/organiser';
import { renderWithProviders } from '@/test/render';
import { graded, grading, reported } from '@/test/contestant';
import { RESULTS_AFTER } from '@/ui/number/words';
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
  groups: [
    {
      group: 'main',
      show: 'always',
      outcome: 'wrong_answer',
      tests: [
        graded('main/1', 'accepted', reported({ time_ms: '12' })),
        graded('main/2', 'wrong_answer', reported({ time_ms: '3' })),
      ],
      shown_at: null,
      ran: true,
    },
  ],
});

/** An accepted run on classic: its folds, its tests' values and its compile log. */
const right = grading({
  status: 'graded',
  outcome: 'accepted',
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
    },
  ],
});

describe("a result's groups", () => {
  it('shows the group and its verdict, and no points', () => {
    renderWithProviders(<ScoredResult grading={wrong} />);
    expect(screen.getByRole('region', { name: 'Group main' })).toHaveTextContent(
      'WRONG ANSWER',
    );
    expect(screen.queryByText(/points/)).toBeNull();
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
    const tests = screen.getByRole('table', { name: 'Tests main' });
    const [, first] = within(tests).getAllByRole('row');
    expect(first).toHaveTextContent('12 ms');
  });

  it('shows each test’s reported values, and no fold over them', () => {
    renderWithProviders(<ScoredResult grading={{ ...wrong, meanings: MEANINGS }} />);

    expect(screen.queryByRole('group', { name: 'Over the tests shown' })).toBeNull();
    const tests = screen.getByRole('table', { name: 'Tests main' });
    const [, first, second] = within(tests).getAllByRole('row');
    expect(first).toHaveTextContent('12 ms');
    expect(second).toHaveTextContent('3 ms');
  });

  it('labels the values in their words and the table’s order, each with its unit (M63)', () => {
    renderWithProviders(<ScoredResult grading={right} />);

    expect(screen.queryByRole('group', { name: 'Over the tests shown' })).toBeNull();
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

    const tests = screen.getByRole('table', { name: 'Tests main' });
    expect(
      within(tests)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Test', 'Outcome', 'time_ms', 'memory_kb']);
    expect(within(tests).getAllByRole('row')[1]).toHaveTextContent('28');
  });
});

describe('a run task’s result', () => {
  it('shows values and each run by its titles, with no penalty', () => {
    renderWithProviders(
      <ScoredResult
        grading={grading({
          status: 'graded',
          meanings: [
            {
              name: 'score',
              title: 'Score',
              unit: 'pts',
              better: null,
              fold: null,
            },
          ],
          run_values: [
            {
              name: 'score',
              number: '10',
              text: null,
              waiting: false,
              self_reported: true,
              show: 'now',
              facts: null,
              runs: null,
              values: null,
            },
          ],
          runs: [
            {
              group: 'samples',
              place: 1,
              id: null,
              dropped: false,
              key: { grid: 'big.txt', seed: 2 },
              titles: ['Big grid', null],
              verdict: 'skipped',
              passed: 0,
              reports: {},
              texts: {},
              label: null,
              message: null,
            },
          ],
        })}
      />,
    );

    expect(screen.getByRole('region', { name: 'Group samples' })).toHaveTextContent(
      'Test 1',
    );
    expect(screen.getByText('Big grid · seed 2')).toBeVisible();
    expect(screen.getByText('SKIPPED')).toBeVisible();
    expect(screen.getByText('Score').closest('div')).toHaveTextContent('10 pts');
    expect(screen.queryByText(/penal/)).toBeNull();
    expect(screen.queryByText(/self-reported/)).toBeNull();
  });

  it('says nothing is shown yet, and when it will be', () => {
    renderWithProviders(
      <ScoredResult
        grading={grading({
          status: 'submitted',
          reveal_at: '2026-09-29T12:00:00Z',
        })}
      />,
    );
    expect(screen.getByText(RESULTS_AFTER)).toBeVisible();
    expect(screen.getByText(/Results at /)).toBeVisible();
  });

  it('reads a text when it is opened', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ScoredResult
        grading={grading({
          status: 'graded',
          once: { reports: {}, texts: { log: { name: null, output: null } } },
          runs: [
            {
              group: 'samples',
              place: 1,
              id: null,
              dropped: false,
              key: {},
              titles: ['Small grid'],
              verdict: 'accepted',
              passed: 1,
              reports: {},
              texts: {},
              label: null,
              message: null,
            },
          ],
        })}
        readText={(ask) => {
          expect(ask).toEqual({
            group: null,
            place: null,
            field: 'texts',
            name: 'log',
            output: null,
          });
          return Promise.resolve('Compiled cleanly.');
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Show log' }));
    expect(screen.getByLabelText('log')).toHaveTextContent('Compiled cleanly.');
  });

  it('shows when a value is shown, a dropped run and the facts', () => {
    renderWithProviders(
      <ScoredResult
        grading={{
          status: 'done',
          groups: [],
          meanings: [],
          values: reported(),
          runs: [
            {
              group: 'all',
              place: 1,
              dropped: true,
              id: 'r',
              key: {},
              titles: ['Small grid'],
              verdict: 'accepted',
              passed: 1,
              reports: {},
              texts: {},
              label: null,
              message: null,
            },
          ],
          run_values: [
            {
              name: 'score',
              number: '7.5',
              text: null,
              waiting: false,
              self_reported: false,
              show: 'on_release',
              facts: null,
              runs: null,
              values: null,
            },
          ],
          facts: { seconds_late: '0', seconds: '1.2' },
          compiled: 1,
        }}
      />,
    );
    expect(screen.getByText(/On release/)).toBeVisible();
    expect(screen.getByText('Dropped')).toBeVisible();
    expect(screen.getByText('Seconds late').closest('div')).toHaveTextContent('0');
    expect(screen.getByText('Compiled').closest('div')).toHaveTextContent('1');
  });
});
