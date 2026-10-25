import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { specCatalogue } from '../formula/catalogue';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
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
    const card = screen.getByRole('region', { name: 'Leaderboard board' });
    await userEvent.click(within(card).getByRole('radio', { name: 'Entrants' }));
    await userEvent.click(
      within(card).getByRole('radio', { name: "Each entrant's own row" }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toContain('rows: own'));
    expect(sent).toContain('who: entrants');
    expect(sent).toContain('board:');
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
    const [points, added] = screen.getAllByRole('textbox', { name: 'Name' });
    await userEvent.type(added!, 'pointsx{Enter}');
    // Emptied on the way, the first column's entries follow its new name.
    await userEvent.clear(points!);
    await userEvent.type(points!, 'total{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toContain('board:'));
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
    const key = screen.getByRole('textbox', { name: 'Key' });
    await userEvent.clear(key);
    await userEvent.type(key, 'gradebook');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This column is refused.')).toBeVisible();
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
