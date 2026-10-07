import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { formatDateTime } from '@/lib/time';
import { hiddenUntilClose, icpc } from '@/test/boards';
import { CONTEST_API, PUBLIC_API } from '@/test/contestant';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';

const PAGE = '/contests/acme/spring/boards';

/** The board's row whose name starts `name`. */
function rowOf(table: HTMLElement, name: string): HTMLElement {
  const found = within(table)
    .getByRole('rowheader', { name: new RegExp(`^${name}`) })
    .closest('tr');
  if (found === null) throw new Error(`No row for ${name}.`);
  return found;
}

describe("a contest's boards for a signed-in person", () => {
  it('ranks each row with every key, tied rows under one rank', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/boards`, () => HttpResponse.json([icpc()])),
    );
    renderApp(PAGE);

    const table = await screen.findByRole('table', { name: 'Standings' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Rank', 'Name', 'Points', 'Penalty', 'A', 'B']);
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((header) => header.textContent),
    ).toEqual(['ada', 'kennyYou', 'carol']);
    const ada = rowOf(table, 'ada');
    expect(
      within(ada)
        .getAllByRole('cell')
        .map((found) => found.textContent),
    ).toEqual(['1', '1', '45', '1 point45 penalty', '2 attempts']);
    expect(within(rowOf(table, 'kenny')).getAllByRole('cell')[0]).toHaveTextContent(
      '1',
    );
    expect(within(rowOf(table, 'carol')).getAllByRole('cell')[0]).toHaveTextContent(
      '3',
    );
  });

  it("marks the reader's own row with what it counts and what still grades", async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/boards`, () => HttpResponse.json([icpc()])),
    );
    renderApp(PAGE);

    const table = await screen.findByRole('table', { name: 'Standings' });
    const own = rowOf(table, 'kenny');
    expect(own).toHaveAttribute('aria-current', 'true');
    expect(rowOf(table, 'ada')).not.toHaveAttribute('aria-current');
    expect(own).toHaveTextContent('1 attempt before');
    expect(own).toHaveTextContent('1 still grading');
    expect(within(own).getByRole('link', { name: '#2' })).toHaveAttribute(
      'href',
      '/contests/acme/spring/tasks/sum?submission=2',
    );
  });

  it('names what is not counted yet with when it joins', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/boards`, () => HttpResponse.json([icpc()])),
    );
    renderApp(PAGE);

    const pending = await screen.findByRole('list', { name: 'Not counted yet' });
    expect(pending).toHaveTextContent(
      `final of B, from ${formatDateTime(new Date('2026-09-12T10:30:00Z'))}`,
    );
  });

  it('labels a penalty that charges nothing for an attempt by the minute', async () => {
    const minute = icpc({
      keys: [
        { by: 'points', better: 'higher', per_attempt: null },
        { by: 'penalty', better: 'lower', per_attempt: 0 },
      ],
    });
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/boards`, () => HttpResponse.json([minute])),
    );
    renderApp(PAGE);

    const table = await screen.findByRole('table', { name: 'Standings' });
    expect(
      within(table).getByRole('columnheader', { name: 'Submitted at minute' }),
    ).toBeVisible();
    expect(table).toHaveTextContent('minute 45');
  });

  it('says when a board that shows nothing yet is shown from', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/boards`, () => HttpResponse.json([hiddenUntilClose])),
    );
    renderApp(PAGE);

    const board = await screen.findByRole('region', { name: 'Final' });
    expect(board).toHaveTextContent(
      `Shown from ${formatDateTime(new Date('2026-09-12T10:30:00Z'))}.`,
    );
    expect(within(board).queryByRole('table')).toBeNull();
  });

  it('says when there is no board to see', async () => {
    server.use(signedIn);
    renderApp(PAGE);

    expect(
      await screen.findByText('This contest has no board you can see.'),
    ).toBeVisible();
  });
});

describe("a contest's boards for a visitor", () => {
  it('shows the boards shown to everyone, read without a session', async () => {
    server.use(
      http.get(`${PUBLIC_API}/:org/:contest/boards`, () =>
        HttpResponse.json([icpc({ who: 'everyone' })]),
      ),
    );
    renderApp(PAGE);

    const table = await screen.findByRole('table', { name: 'Standings' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
  });

  it('asks them to sign in for a contest that is not public', async () => {
    server.use(
      http.get(`${PUBLIC_API}/:org/:contest/boards`, () => problem(404, 'not_found')),
    );
    renderApp(PAGE);

    expect(
      await screen.findByRole('heading', { name: 'Sign in to see this contest' }),
    ).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
