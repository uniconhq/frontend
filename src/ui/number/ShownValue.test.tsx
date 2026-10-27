import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { formatExact } from '@/lib/exact';
import { renderWithProviders } from '@/test/render';
import { ShownValue } from './ShownValue';
import {
  BEING_CHECKED,
  MISSING,
  NOT_GIVEN,
  RESULTS_AFTER,
  gradingCount,
  heldCount,
} from './words';

function shown(props: Parameters<typeof ShownValue>[0]) {
  renderWithProviders(<ShownValue {...props} />);
}

describe('ShownValue', () => {
  it('rounds a number and keeps the exact digits on hover', () => {
    shown({ number: '2.675', decimals: 2 });
    const value = screen.getByText(formatExact('2.675', 2));
    expect(value).toHaveAttribute('title', '2.675');
  });

  it('shows text as given, on one line', () => {
    shown({ number: null, text: 'wrong answer' });
    expect(screen.getByText('wrong answer')).toBeInTheDocument();
  });

  it('shows a dash for a missing number', () => {
    shown({ number: null });
    expect(screen.getByText(MISSING)).toBeInTheDocument();
  });

  it('shows a dash for missing text', () => {
    shown({ number: null, text: null });
    expect(screen.getByText(MISSING)).toBeInTheDocument();
  });

  it('shows a dash for a hidden cell and does not give its number away', () => {
    shown({ number: '5', hidden: true });
    expect(screen.getByText(MISSING)).toBeInTheDocument();
    expect(screen.queryByTitle('5')).not.toBeInTheDocument();
  });

  it('says being checked while a value waits', () => {
    shown({ number: '5', waiting: true });
    expect(screen.getByText(BEING_CHECKED)).toBeInTheDocument();
  });

  it('says how many are grading and how many are held', () => {
    expect(gradingCount(1)).toBe('1 grading');
    expect(heldCount(3)).toBe('3 held');
  });

  it('says a submitted result is shown after the contest', () => {
    expect(RESULTS_AFTER).toBe('Submitted, results after the contest');
  });

  it('says a skipped run was not given', () => {
    expect(NOT_GIVEN).toBe('Not given');
  });
});
