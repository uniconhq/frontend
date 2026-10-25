import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';

const PAGE = '/orgs/acme/contests/spring/tasks/sum/queue';
const QUEUE = '/api/v1/orgs/:org/contests/:contest/tasks/:task/organise/queue';
const ENTER =
  '/api/v1/orgs/:org/contests/:contest/tasks/:task/organise/submissions/:number/entries';

const ROW = {
  closed_at: '2026-10-01T12:00:00Z',
  row: { entrant: 'ada', name: 'ada' },
  submissions: [
    {
      number: 4,
      counted_by: [{ leaderboard: 'gradebook', column: 'points' }],
      marks: [{ value: 'score', mark: null }],
    },
  ],
};

describe('the grading queue', () => {
  it('saves a mark on Enter and says when', async () => {
    const user = userEvent.setup();
    let body: unknown = null;
    server.use(
      signedIn,
      http.get(QUEUE, () => HttpResponse.json([ROW])),
      http.post(ENTER, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          value: 'score',
          mark: '7.5',
          by: 7,
          at: '2026-10-25T01:00:00Z',
        });
      }),
    );
    renderApp(PAGE);
    const box = await screen.findByRole('textbox', { name: 'score' });
    await user.type(box, '7.5{Enter}');
    expect(body).toEqual({ value: 'score', mark: '7.5' });
    expect(await screen.findByText(/Saved /)).toBeVisible();
  });

  it('says when a mark is outside its bounds', async () => {
    const user = userEvent.setup();
    server.use(
      signedIn,
      http.get(QUEUE, () => HttpResponse.json([ROW])),
      http.post(ENTER, () =>
        problem(422, 'invalid_mark', { detail: 'Give a number from 0 to 10.' }),
      ),
    );
    renderApp(PAGE);
    const box = await screen.findByRole('textbox', { name: 'score' });
    await user.type(box, '20{Enter}');
    expect(await screen.findByText('Give a number from 0 to 10.')).toBeVisible();
  });

  it('drops a saved mark from unmarked only', async () => {
    const user = userEvent.setup();
    let mark: string | null = null;
    server.use(
      signedIn,
      http.get(QUEUE, () =>
        HttpResponse.json([
          {
            ...ROW,
            submissions: [{ ...ROW.submissions[0], marks: [{ value: 'score', mark }] }],
          },
        ]),
      ),
      http.post(ENTER, async ({ request }) => {
        const body = (await request.json()) as { mark: string };
        mark = body.mark;
        return HttpResponse.json({
          value: 'score',
          mark: body.mark,
          by: 7,
          at: '2026-10-25T01:00:00Z',
        });
      }),
    );
    renderApp(PAGE);
    await user.click(await screen.findByRole('checkbox', { name: 'Unmarked only' }));
    await user.type(screen.getByRole('textbox', { name: 'score' }), '7.5{Enter}');
    expect(await screen.findByText('Nothing is waiting for a mark.')).toBeVisible();
  });

  it('clears a mark by leaving the box empty', async () => {
    const user = userEvent.setup();
    let body: unknown = null;
    server.use(
      signedIn,
      http.get(QUEUE, () =>
        HttpResponse.json([
          {
            ...ROW,
            submissions: [
              { ...ROW.submissions[0], marks: [{ value: 'score', mark: '7.5' }] },
            ],
          },
        ]),
      ),
      http.post(ENTER, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          value: 'score',
          mark: '',
          by: 7,
          at: '2026-10-25T01:00:00Z',
        });
      }),
    );
    renderApp(PAGE);
    const box = await screen.findByRole('textbox', { name: 'score' });
    await user.clear(box);
    await user.type(box, '{Enter}');
    expect(body).toEqual({ value: 'score', mark: '' });
  });

  it('posts nothing when the box did not change, and refuses a mark that is no decimal', async () => {
    const user = userEvent.setup();
    let posts = 0;
    server.use(
      signedIn,
      http.get(QUEUE, () =>
        HttpResponse.json([
          {
            ...ROW,
            submissions: [
              { ...ROW.submissions[0], marks: [{ value: 'score', mark: '7.5' }] },
            ],
          },
        ]),
      ),
      http.post(ENTER, () => {
        posts += 1;
        return HttpResponse.json({
          value: 'score',
          mark: '7.5',
          by: 7,
          at: '2026-10-25T01:00:00Z',
        });
      }),
    );
    renderApp(PAGE);
    const box = await screen.findByRole('textbox', { name: 'score' });
    await user.click(box);
    await user.tab();
    await user.type(box, '{Enter}');
    expect(posts).toBe(0);
    await user.clear(box);
    await user.type(box, 'seven{Enter}');
    expect(
      await screen.findByText('Write the mark as a plain decimal, such as 7.5.'),
    ).toBeVisible();
    expect(posts).toBe(0);
  });
});
