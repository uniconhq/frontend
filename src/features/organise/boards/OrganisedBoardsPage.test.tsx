import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { icpc, organised, row, cell } from '@/test/boards';
import { CONTEST_API } from '@/test/organiser';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';

const PAGE = '/orgs/acme/contests/spring/boards';

/** Before B's final group is shown: kenny is level with ada now, ahead of her once it is. */
const final = icpc({
  not_in_view: [],
  rows: [
    row(1, 7, 'kenny', ['2', '115'], {
      sum: cell({
        counting: true,
        numbers: { points: '1', penalty: '45' },
        grading: 0,
      }),
      max: cell({
        counting: true,
        numbers: { points: '1', penalty: '70' },
        grading: 0,
      }),
    }),
    ...icpc().rows.filter((found) => found.row.name !== 'kenny'),
  ],
});

describe("the organisers' boards", () => {
  it('shows each board now and final, every row and none marked as theirs', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/organise/boards`, () =>
        HttpResponse.json([
          { ...organised(icpc(), final), notes: ['B gives no points.'] },
        ]),
      ),
    );
    renderApp(PAGE);

    const now = await screen.findByRole('table', { name: 'Standings now' });
    const later = screen.getByRole('table', { name: 'Standings final' });
    expect(within(now).getAllByRole('rowheader')).toHaveLength(3);
    expect(within(now).queryByText('The row picked')).toBeNull();
    expect(within(later).getAllByRole('rowheader')[0]).toHaveTextContent('kenny');
    expect(screen.getByRole('list', { name: 'Not counted yet' })).toHaveTextContent(
      'final of B',
    );
    expect(screen.getByRole('note', { name: 'Notes on Standings' })).toHaveTextContent(
      'B gives no points.',
    );
  });

  it('reads now as the row picked, kept in the address', async () => {
    const asked: string[] = [];
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/organise/boards`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        asked.push(query.toString());
        const picked = query.get('user_id') === '30';
        const now = picked
          ? icpc({
              rows: icpc().rows.map((found) =>
                found.row.name === 'carol'
                  ? { ...found, cells: { sum: cell({ grading: 0 }), max: cell() } }
                  : {
                      ...found,
                      cells: Object.fromEntries(
                        Object.entries(found.cells).map(([task, held]) => [
                          task,
                          { ...held, grading: null, submissions: null },
                        ]),
                      ),
                    },
              ),
            })
          : icpc();
        return HttpResponse.json([organised(now, final)]);
      }),
    );
    const user = userEvent.setup();
    const { router } = renderApp(PAGE);
    await screen.findByRole('table', { name: 'Standings now' });

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Read now as' }),
      'carol',
    );

    await waitFor(() => expect(asked.at(-1)).toBe('user_id=30'));
    expect(router.state.location.search).toBe('?row=user%3A30');
    const now = screen.getByRole('table', { name: 'Standings now' });
    await waitFor(() =>
      expect(within(now).getByText('The row picked').closest('tr')).toHaveTextContent(
        'carol',
      ),
    );
  });

  it('says when the contest has no boards', async () => {
    server.use(signedIn);
    renderApp(PAGE);

    expect(await screen.findByText('This contest has no boards.')).toBeVisible();
  });
});
