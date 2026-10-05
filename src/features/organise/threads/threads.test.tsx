import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Announcement, Clarification } from '@/api/types';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';

const CONTEST_API = '/api/v1/orgs/:org/contests/:contest';

function announcement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    where: { org: 'acme', contest: 'spring', task: null },
    number: 1,
    title: 'Welcome',
    body: 'Good luck.',
    posted_at: '2026-09-12T09:00:00Z',
    closed: false,
    answers_question: false,
    answers: null,
    ...overrides,
  };
}

function question(overrides: Partial<Clarification> = {}): Clarification {
  return {
    contest: { org: 'acme', contest: 'spring', task: null },
    asker: 20,
    number: 1,
    task: null,
    title: 'Input size?',
    body: 'How big is n?',
    asked_at: '2026-09-12T09:10:00Z',
    answered: false,
    closed: false,
    messages: [],
    ...overrides,
  };
}

describe("a contest's announcements, for its organisers", () => {
  it('posts, edits and closes, keeping a closed one readable and offering no delete', async () => {
    let listed: Announcement[] = [announcement()];
    const sent: unknown[] = [];
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/announcements`, () => HttpResponse.json(listed)),
      http.post(`${CONTEST_API}/announcements`, async ({ request }) => {
        const body = (await request.json()) as { title: string; body: string };
        sent.push(body);
        const made = announcement({ number: 2, ...body });
        listed = [...listed, made];
        return HttpResponse.json(made, { status: 201 });
      }),
      http.post(`${CONTEST_API}/announcements/:number/close`, ({ params }) => {
        listed = listed.map((found) =>
          String(found.number) === params.number ? { ...found, closed: true } : found,
        );
        return HttpResponse.json(
          listed.find((found) => String(found.number) === params.number),
        );
      }),
    );
    renderApp('/orgs/acme/contests/spring');

    const form = await screen.findByRole('form', { name: 'Post announcement' });
    await userEvent.type(within(form).getByLabelText(/Title/), 'Lunch');
    await userEvent.type(within(form).getByLabelText(/Text/), 'At noon.');
    await userEvent.click(
      within(form).getByRole('button', { name: 'Post announcement' }),
    );
    await waitFor(() => expect(sent).toEqual([{ title: 'Lunch', body: 'At noon.' }]));
    expect(await screen.findByText('Lunch')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Close Welcome' }));

    const list = screen.getAllByRole('list', { name: 'Announcements' })[0]!;
    await waitFor(() => expect(within(list).getByText(/closed/)).toBeVisible());
    expect(within(list).getByText('Welcome')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
  });
});

describe('posting an announcement', () => {
  it('sends once however often Post is clicked while the list catches up', async () => {
    let posted = 0;
    let release: () => void = () => undefined;
    const slowList = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/announcements`, async () => {
        if (posted > 0) await slowList;
        return HttpResponse.json([]);
      }),
      http.post(`${CONTEST_API}/announcements`, () => {
        posted += 1;
        return HttpResponse.json(announcement({ number: 2 }), { status: 201 });
      }),
    );
    renderApp('/orgs/acme/contests/spring');

    const form = await screen.findByRole('form', { name: 'Post announcement' });
    await userEvent.type(within(form).getByLabelText(/Title/), 'Lunch');
    await userEvent.type(within(form).getByLabelText(/Text/), 'At noon.');
    const post = within(form).getByRole('button', { name: 'Post announcement' });
    await userEvent.click(post);
    await waitFor(() => expect(posted).toBe(1));
    await userEvent.click(post);
    release();

    await waitFor(() => expect(within(form).getByLabelText(/Title/)).toHaveValue(''));
    expect(posted).toBe(1);
  });
});

describe('the inbox', () => {
  it('lists the open questions, and only marking takes one off', async () => {
    let open = [question()];
    const marked: string[] = [];
    server.use(
      signedIn,
      http.get('/api/v1/orgs/:org/clarifications', () => HttpResponse.json(open)),
      http.put(
        '/api/v1/orgs/:org/contests/:contest/clarifications/:asker/:number/answered',
        ({ params }) => {
          marked.push(`${String(params.asker)}/${String(params.number)}`);
          open = [];
          return HttpResponse.json(question({ answered: true, closed: true }));
        },
      ),
    );
    renderApp('/orgs/acme/clarifications');

    expect(await screen.findByText('Input size?')).toBeVisible();
    expect(screen.getByText(/only Mark as answered takes it off/)).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Mark as answered Input size?' }),
    );

    expect(await screen.findByText('No question is waiting.')).toBeVisible();
    expect(marked).toEqual(['20/1']);
  });
});
