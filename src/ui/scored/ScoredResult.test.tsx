import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { graded, grading, reported } from '@/test/contestant';
import { ScoredResult } from './ScoredResult';

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

describe("a result's values over its tests", () => {
  it('shows nothing in place of a fold a wrong answer has no value for, each test keeping its own', () => {
    const { container } = renderWithProviders(<ScoredResult grading={wrong} />);

    expect(screen.queryByRole('definition')).toBeNull();
    expect(screen.queryByLabelText('Over the tests')).toBeNull();
    expect(container).not.toHaveTextContent(/—/);
    const tests = screen.getByRole('table', { name: 'Tests main' });
    const [, first, second] = within(tests).getAllByRole('row');
    expect(first).toHaveTextContent('12');
    expect(second).toHaveTextContent('3');
  });

  it('shows the folds that have a value and leaves out the one that has none', () => {
    renderWithProviders(
      <ScoredResult grading={{ ...wrong, folded: { memory_kb: '2048' } }} />,
    );

    const over = screen.getByLabelText('Over the tests');
    expect(
      within(over)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['memory_kb']);
    expect(over).not.toHaveTextContent('time_ms');
  });
});
