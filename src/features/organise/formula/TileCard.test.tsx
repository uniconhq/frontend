import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { FormulaTiles } from './Editor';
import { specCatalogue } from './catalogue';

function tiles() {
  const insert = vi.fn();
  renderWithProviders(
    <FormulaTiles
      target="points"
      onInsert={insert}
      catalogue={specCatalogue()}
      scope={{
        where: 'task',
        names: ['points', 'late'],
        sets: ['small', 'all'],
        each: ['small.score', 'all.score'],
        fields: { score: 'number' },
        members: { small: ['Small 1', 'Small 2'] },
      }}
      names={
        new Map([['late', { kind: 'fact', description: 'Seconds after the deadline' }]])
      }
    />,
  );
  return insert;
}

it('waits 300 ms on hover and closes on leaving or Escape, without inserting', async () => {
  vi.useFakeTimers();
  try {
    const insert = tiles();
    const tile = screen.getByRole('button', { name: 'sum(…) numbers → one number' });
    fireEvent.mouseEnter(tile.parentElement!);
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole('tooltip')).toHaveTextContent('sum(small.score)');
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'where (optional): a number for each run',
    );
    expect(tile).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
    fireEvent.keyDown(tile, { key: 'Escape' });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(tile.parentElement!);
    fireEvent.mouseLeave(tile.parentElement!);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(insert).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it('opens immediately for keyboard focus, closes on blur and inserts once on click', () => {
  const insert = tiles();
  const tile = screen.getByRole('button', { name: 'sum(…) numbers → one number' });
  fireEvent.focus(tile);
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    "a column summed over a group's runs",
  );
  fireEvent.blur(tile);
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.click(tile);
  expect(insert).toHaveBeenCalledExactlyOnceWith({ text: 'sum()', caret: 4 });
});

it('shows group members, fact words, five columns and no self tile', () => {
  tiles();
  expect(
    screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent),
  ).toEqual([
    'Start from',
    'For each run',
    'Many into one',
    'Pick one run, then read from it',
    'Maths, tests and text',
  ]);
  expect(screen.queryByRole('button', { name: 'points one number' })).toBeNull();
  fireEvent.focus(screen.getByRole('button', { name: 'small a group · 2 runs' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent('Small 1Small 2');
  fireEvent.blur(screen.getByRole('button', { name: 'small a group · 2 runs' }));
  fireEvent.focus(screen.getByRole('button', { name: 'late one number' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent('Seconds after the deadline');
});

it('opens the separate information control without inserting', () => {
  const insert = tiles();
  fireEvent.click(screen.getByLabelText('About sum(…)'));
  expect(screen.getByRole('tooltip')).toHaveTextContent('sum(small.score)');
  expect(insert).not.toHaveBeenCalled();
});
