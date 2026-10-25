import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { screen, within } from '@testing-library/react';
import type { components } from '@/api/schema';
import { renderWithProviders } from '@/test/render';
import { taskPoints } from './points';
import { LeaderboardTable } from './table';

type Leaderboard = components['schemas']['Leaderboard'];
type Header = components['schemas']['Header'];
type Cell = components['schemas']['LeaderboardCell'];
type Row = components['schemas']['LeaderboardRow'];

const open = (task: string, number: number) =>
  `/tasks/${task}?submission=${String(number)}`;

function header(name: string, over: Partial<Header> = {}): Header {
  return {
    name,
    places: null,
    at_least: null,
    at_most: null,
    self_reported: [],
    ...over,
  };
}

function cell(column: string, over: Partial<Cell> = {}): Cell {
  return {
    column,
    number: null,
    text: null,
    hidden: false,
    counted: null,
    waiting: null,
    ...over,
  };
}

function row(name: string, over: Partial<Row> = {}): Row {
  return {
    place: null,
    grading: null,
    held: 0,
    row: { entrant: name, name },
    cells: [],
    ...over,
  };
}

function board(over: Partial<Leaderboard> = {}): Leaderboard {
  return {
    key: 'gradebook',
    title: 'Gradebook',
    audience: { who: 'entrants', rows: 'all' },
    headers: [header('points')],
    sort: [{ column: 'points', way: 'desc' }],
    dropped: [],
    held_from: null,
    rows: [],
    ...over,
  };
}

describe('a leaderboard table', () => {
  it('shares a place between ties and skips the next', () => {
    renderWithProviders(
      <LeaderboardTable
        board={board({
          rows: [
            row('ada', { place: 1, cells: [cell('points', { number: '10' })] }),
            row('bo', { place: 1, cells: [cell('points', { number: '10' })] }),
            row('cy', { place: 3, cells: [cell('points', { number: '4' })] }),
          ],
        })}
      />,
    );
    expect(placeOf('ada')).toHaveTextContent('1');
    expect(placeOf('bo')).toHaveTextContent('1');
    expect(placeOf('cy')).toHaveTextContent('3');
  });

  it('shows no places when a sort key was dropped, and says the order is partial', () => {
    renderWithProviders(
      <LeaderboardTable
        board={board({
          dropped: ['penalty'],
          rows: [row('ada', { place: 1, cells: [cell('points', { number: '10' })] })],
        })}
      />,
    );
    expect(placeOf('ada')).toHaveTextContent('–');
    expect(placeOf('ada')).not.toHaveTextContent('1');
    expect(screen.getByText('The order is partial.')).toBeVisible();
  });

  it('says how many a row holds and when the hold began', () => {
    renderWithProviders(
      <LeaderboardTable
        board={board({
          held_from: '2030-10-01T13:00:00Z',
          rows: [
            row('ada', { place: 1, held: 3, cells: [cell('points', { number: '1' })] }),
          ],
        })}
      />,
    );
    expect(screen.getByRole('row', { name: /ada/ })).toHaveTextContent('3 held');
    expect(screen.getByText(/Held from /)).toBeVisible();
  });

  it('hides a cell, and keeps bounds and a self-reported mark on the header', () => {
    renderWithProviders(
      <LeaderboardTable
        staff
        board={board({
          headers: [
            header('score', {
              at_least: '0',
              at_most: '100',
              self_reported: [{ task: 'islands', value: 'score' }],
            }),
          ],
          rows: [
            row('ada', {
              place: 1,
              cells: [cell('score', { number: '5', hidden: true })],
            }),
          ],
        })}
      />,
    );
    const heading = screen.getByRole('columnheader', { name: /score/ });
    expect(heading).toHaveTextContent('at least 0, at most 100');
    expect(heading).toHaveTextContent('Self-reported');
    const ada = screen.getByRole('row', { name: /ada/ });
    expect(ada).toHaveTextContent('–');
    expect(ada).not.toHaveTextContent('5');
    expect(ada).not.toHaveTextContent('Self-reported');
  });

  it('keeps bounds off the header for anyone who is not staff', () => {
    renderWithProviders(
      <LeaderboardTable
        board={board({
          headers: [
            header('score', {
              at_least: '0',
              at_most: '100',
              self_reported: [{ task: 'sum', value: 'score' }],
            }),
          ],
          rows: [row('ada', { place: 1, cells: [cell('score', { number: '5' })] })],
        })}
      />,
    );
    const heading = screen.getByRole('columnheader', { name: /score/ });
    expect(heading).not.toHaveTextContent('at least');
    expect(heading).toHaveTextContent('Self-reported');
  });

  it('opens counted submissions and what is still grading only on a row that has them', () => {
    renderWithProviders(
      <MemoryRouter>
        <LeaderboardTable
          submissionTo={open}
          board={board({
            audience: { who: 'entrants', rows: 'own' },
            rows: [
              row('ada', {
                cells: [
                  cell('points', {
                    number: '62',
                    counted: [{ task: 'sum', number: 4 }],
                    waiting: [{ task: 'sum', number: 5 }],
                  }),
                ],
                grading: 2,
              }),
              row('bo', {
                place: 2,
                cells: [cell('points', { number: '10', counted: null, waiting: null })],
              }),
            ],
          })}
        />
      </MemoryRouter>,
    );
    expect(placeOf('ada')).toHaveTextContent('–');
    const ada = screen.getByRole('row', { name: /ada/ });
    expect(within(ada).getByRole('link', { name: 'Submission 4' })).toHaveAttribute(
      'href',
      '/tasks/sum?submission=4',
    );
    expect(
      within(ada).getByRole('link', { name: 'Submission 5, being checked' }),
    ).toBeVisible();
    expect(ada).toHaveTextContent('2 grading');
    expect(
      within(screen.getByRole('row', { name: /bo/ })).queryByRole('link'),
    ).toBeNull();
  });

  it('shows every row it is given, including one with no place after the placed rows', () => {
    renderWithProviders(
      <LeaderboardTable
        board={board({
          rows: [
            row('ada', { place: 1, cells: [cell('points', { number: '9' })] }),
            row('bo', { place: 1, cells: [cell('points', { number: '9' })] }),
            row('me', { cells: [cell('points', { number: '1' })] }),
          ],
        })}
      />,
    );
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(placeOf('me')).toHaveTextContent('–');
  });
});

describe('a task’s points', () => {
  it('reads the cell that counted this task alone, not a total over several', () => {
    const standing = [
      board({
        headers: [
          header('total', { at_most: '200' }),
          header('points', { at_most: '100', places: 1 }),
        ],
        rows: [
          row('ada', {
            cells: [
              cell('total', {
                number: '90',
                counted: [
                  { task: 'sum', number: 1 },
                  { task: 'other', number: 2 },
                ],
              }),
              cell('points', {
                number: '62.25',
                counted: [{ task: 'sum', number: 1 }],
              }),
            ],
          }),
        ],
      }),
    ];
    expect(taskPoints('sum', standing)).toEqual([
      { board: 'gradebook', number: '62.25', places: 1, most: '100' },
    ]);
    expect(taskPoints('other', standing)).toEqual([]);
  });

  it('formats the bounds staff are told', () => {
    renderWithProviders(
      <LeaderboardTable
        staff
        board={board({
          headers: [header('points', { at_least: '0', at_most: '1000000' })],
        })}
      />,
    );
    expect(screen.getByText('at least 0, at most 1,000,000')).toBeVisible();
  });
});

function placeOf(name: string) {
  const cells = within(
    screen.getByRole('row', { name: new RegExp(name) }),
  ).getAllByRole('cell');
  const place = cells[0];
  if (place === undefined) throw new Error('no place');
  return place;
}
