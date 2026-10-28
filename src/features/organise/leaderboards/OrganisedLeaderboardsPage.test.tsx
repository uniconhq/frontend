import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { specCatalogue } from '../formula/catalogue';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { CONTEST_API, repoFiles } from '@/test/organiser';
import userEvent from '@/test/user-event';

const PAGE = '/orgs/acme/contests/spring/leaderboards';

describe("a contest's leaderboards for its organisers", () => {
  beforeEach(() => {
    // The formula line measures its text. jsdom's ranges have no client rects.
    Range.prototype.getClientRects = () => {
      const rects = [] as unknown as DOMRectList;
      Object.defineProperty(rects, 'length', { value: 0 });
      rects.item = () => null;
      return rects;
    };
    server.use(
      signedIn,
      ...repoFiles,
      http.get('/api/v1/blocks', () => HttpResponse.json(specCatalogue())),
    );
  });

  it('shows observers formulas read-only without offering changes or tiles', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            { names: { org: 'acme', contest: 'spring', task: null }, role: 'observer' },
          ],
        }),
      ),
    );
    server.use(
      http.get(`${CONTEST_API}/files/contest.yaml`, () =>
        HttpResponse.json({
          path: 'contest.yaml',
          encoding: 'utf-8',
          token: 'v0',
          version: 'v0',
          upload: null,
          content:
            'name: Spring\nleaderboards:\n  standings:\n    title: Standings\n    columns: {points: 1}\n',
        }),
      ),
    );
    renderApp(PAGE);
    const line = await screen.findByRole('textbox', { name: 'points' });
    expect(line).toHaveAttribute('contenteditable', 'false');
    expect(line).toHaveAttribute('aria-readonly', 'true');
    await userEvent.click(line);
    expect(screen.queryByText(/Click a tile to put it in/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a leaderboard' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove points' })).toBeNull();
  });

  it('adds a leaderboard and writes who sees it', async () => {
    let sent = '';
    server.use(
      http.put(`${CONTEST_API}/files/:path`, async ({ request }) => {
        sent = ((await request.json()) as { content: string }).content;
        return HttpResponse.json({ version: '9f8e7d6c5b4a39281706', notes: [] });
      }),
    );
    renderApp(PAGE);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a leaderboard' }),
    );
    const card = screen.getByRole('region', { name: 'Leaderboard leaderboard' });
    await userEvent.click(within(card).getByRole('radio', { name: 'Entrants' }));
    await userEvent.click(
      within(card).getByRole('radio', { name: 'Only their own row' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toContain('rows: own'));
    expect(sent).toContain('who: entrants');
    expect(sent).toContain('leaderboard:');
  });

  it('asks before leaving with changes not saved, and leaves at once after the save', async () => {
    server.use(
      http.put(`${CONTEST_API}/files/:path`, () =>
        HttpResponse.json({ version: '9f8e7d6c5b4a39281706', notes: [] }),
      ),
    );
    const { router } = renderApp(PAGE);
    const away = '/orgs/acme/contests/spring';
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a leaderboard' }),
    );

    await act(() => router.navigate(away));
    const asking = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    expect(asking).toHaveTextContent('Your changes to the leaderboards are not saved.');
    await userEvent.click(within(asking).getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe(PAGE);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved.');
    await act(() => router.navigate(away));
    await waitFor(() => expect(router.state.location.pathname).toBe(away));
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeNull();
  });

  it('offers the freeze only once there is a leaderboard', async () => {
    renderApp(PAGE);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a leaderboard' }),
    );
    expect(screen.getByRole('region', { name: 'Freeze' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Remove leaderboard' }));
    expect(screen.queryByRole('region', { name: 'Freeze' })).toBeNull();
  });

  it("moves a column's sort and display once its name is done, not while it is typed", async () => {
    let sent = '';
    server.use(
      http.put(`${CONTEST_API}/files/:path`, async ({ request }) => {
        sent = ((await request.json()) as { content: string }).content;
        return HttpResponse.json({ version: '9f8e7d6c5b4a39281706', notes: [] });
      }),
    );
    renderApp(PAGE);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a leaderboard' }),
    );
    // A new column typed through `points` on its way leaves points' entries.
    await userEvent.click(screen.getByRole('button', { name: 'Add a column' }));
    const [, points, added] = screen.getAllByRole('textbox', { name: 'Name' });
    await userEvent.clear(added!);
    await userEvent.type(added!, 'pointsx{Enter}');
    // Emptied on the way, the first column's entries follow its new name.
    await userEvent.clear(points!);
    await userEvent.type(points!, 'total{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toContain('leaderboard:'));
    expect(sent).toMatch(/sort:\n\s+- total: desc/);
    expect(sent).not.toContain('pointsx: desc');
    expect(sent).not.toMatch(/points: (desc|"")/);
  });

  it('marks the column a save refuses', async () => {
    server.use(
      http.put(`${CONTEST_API}/files/:path`, () =>
        problem(422, 'invalid_definition', {
          errors: [
            {
              path: 'leaderboards.gradebook.columns.points',
              message: 'This column is refused.',
            },
          ],
        }),
      ),
    );
    renderApp(PAGE);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a leaderboard' }),
    );
    const key = screen.getAllByRole('textbox', { name: 'Name' })[0]!;
    await userEvent.clear(key);
    await userEvent.type(key, 'gradebook');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This column is refused.')).toBeVisible();
  });

  it('names a refused leaderboard by the name its card shows, in the page’s words', async () => {
    server.use(
      http.put(`${CONTEST_API}/files/:path`, () =>
        problem(422, 'invalid_definition', {
          errors: [
            { path: 'leaderboards.icpc.sort', message: 'Rank by a column it has.' },
          ],
        }),
      ),
    );
    renderApp(PAGE);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a leaderboard' }),
    );
    const name = screen.getAllByRole('textbox', { name: 'Name' })[0]!;
    await userEvent.clear(name);
    await userEvent.type(name, 'ICPC');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const errors = await screen.findByRole('list', { name: 'Errors' });
    expect(
      within(errors).getByRole('link', { name: 'Leaderboards, ICPC: Ranking' }),
    ).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/leaderboards?field=icpc.sort',
    );
  });

  it('has one name and explains the top rows to entrants', async () => {
    renderApp(PAGE);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a leaderboard' }),
    );
    expect(screen.queryByRole('textbox', { name: 'Key' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull();
    await userEvent.type(
      screen.getAllByRole('textbox', { name: 'Name' })[0]!,
      'Standings',
    );
    const card = screen.getByRole('region', { name: 'Leaderboard standings' });
    await userEvent.click(within(card).getByRole('radio', { name: 'Entrants' }));
    await userEvent.click(within(card).getByRole('radio', { name: 'The top rows' }));
    expect(
      within(card).getByText(
        'Entrants see the top 10 rows, and their own row when it is lower. Organisers always see every row.',
      ),
    ).toBeVisible();
  });

  it('heads each card with its leaderboard’s name and each part with its own heading', async () => {
    server.use(
      http.get(`${CONTEST_API}/files/contest.yaml`, () =>
        HttpResponse.json({
          path: 'contest.yaml',
          encoding: 'utf-8',
          token: 'v0',
          version: 'v0',
          upload: null,
          content:
            'name: Spring\nleaderboards:\n  standings:\n    title: Standings\n    columns: {points: 1}\n  icpc:\n    columns: {solved: 1}\n',
        }),
      ),
    );
    renderApp(PAGE);
    const standings = await screen.findByRole('region', {
      name: 'Leaderboard standings',
    });
    expect(
      within(standings).getByRole('heading', { level: 2, name: 'Standings' }),
    ).toBeVisible();
    // A leaderboard with no name is headed with its key.
    const icpc = screen.getByRole('region', { name: 'Leaderboard icpc' });
    expect(within(icpc).getByRole('heading', { level: 2, name: 'icpc' })).toBeVisible();
    for (const part of ['Columns', 'Ranking', 'Shown on the leaderboard']) {
      expect(
        within(standings).getByRole('heading', { level: 3, name: part }),
      ).toBeVisible();
    }
    const ranking = within(standings).getByRole('region', { name: 'Ranking' });
    expect(within(ranking).getByRole('button', { name: 'Rank by' })).toBeVisible();
    const name = within(standings).getAllByRole('textbox', { name: 'Name' })[0]!;
    await userEvent.clear(name);
    await userEvent.type(name, 'Final results');
    expect(
      within(standings).getByRole('heading', { level: 2, name: 'Final results' }),
    ).toBeVisible();
  });

  it('says why the rows are held under the question, while organisers alone see it', async () => {
    renderApp(PAGE);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a leaderboard' }),
    );
    const card = screen.getByRole('region', { name: 'Leaderboard leaderboard' });
    await userEvent.click(within(card).getByRole('radio', { name: 'Organisers only' }));
    const note = within(card).getByText(
      'Organisers always see every row, so this matters once entrants can see it.',
    );
    const first = within(card).getByRole('radio', { name: 'Every row' });
    expect(
      note.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it('keeps a saved leaderboard’s link when its name changes', async () => {
    server.use(
      http.get(`${CONTEST_API}/files/contest.yaml`, () =>
        HttpResponse.json({
          path: 'contest.yaml',
          encoding: 'utf-8',
          token: 'v0',
          version: 'v0',
          upload: null,
          content:
            'name: Spring\nleaderboards:\n  standings:\n    title: Standings\n    columns: {points: 1}\n',
        }),
      ),
    );
    renderApp(PAGE);
    const card = await screen.findByRole('region', { name: 'Leaderboard standings' });
    const name = within(card).getAllByRole('textbox', { name: 'Name' })[0]!;
    await userEvent.clear(name);
    await userEvent.type(name, 'Final results');
    expect(within(card).getByText(/formulas: standings/)).toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'Leaderboard final_results' }),
    ).toBeNull();
  });

  it('puts a refused key under Name', async () => {
    server.use(
      http.put(`${CONTEST_API}/files/:path`, () =>
        problem(422, 'invalid_definition', {
          errors: [
            { path: 'leaderboards.leaderboard', message: 'That name is taken.' },
          ],
        }),
      ),
    );
    renderApp(PAGE);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a leaderboard' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('That name is taken.')).toBeVisible();
    expect(
      screen.getAllByRole('textbox', { name: 'Name' })[0],
    ).toHaveAccessibleDescription('That name is taken.');
  });

  it('says which task settings could not be read, so what is read of them is not checked', async () => {
    server.use(
      http.get(`${CONTEST_API}/tasks/sort/files/:path`, () => problem(500, 'internal')),
    );
    renderApp(PAGE);

    expect(
      await screen.findByText(
        'The settings of sort could not be read, so what a leaderboard reads of it is not checked here.',
      ),
    ).toBeVisible();
  });

  it('says the blocks could not be loaded, which is why it cannot save', async () => {
    server.use(http.get('/api/v1/blocks', () => problem(500, 'internal')));
    renderApp(PAGE);

    expect(
      await screen.findByText(/The blocks formulas are made of could not be loaded/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
