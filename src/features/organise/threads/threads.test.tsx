import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
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
    asker: '20',
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
    const closing =
      (closed: boolean) =>
      ({ params }: { params: Record<string, unknown> }) => {
        listed = listed.map((found) =>
          String(found.number) === params['number'] ? { ...found, closed } : found,
        );
        return HttpResponse.json(
          listed.find((found) => String(found.number) === params['number']),
        );
      };
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
      http.post(`${CONTEST_API}/announcements/:number/close`, closing(true)),
      http.post(`${CONTEST_API}/announcements/:number/reopen`, closing(false)),
    );
    renderApp('/orgs/acme/contests/spring/announcements');

    const form = await screen.findByRole('form', { name: 'Post announcement' });
    await userEvent.type(within(form).getByLabelText(/Title/), 'Lunch');
    await userEvent.type(within(form).getByLabelText(/Text/), 'At noon.');
    await userEvent.click(
      within(form).getByRole('button', { name: 'Post announcement' }),
    );
    await waitFor(() => expect(sent).toEqual([{ title: 'Lunch', body: 'At noon.' }]));
    expect(await screen.findByText('Lunch')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Close Welcome' }));
    const asked = await screen.findByRole('dialog', {
      name: 'Close this announcement?',
    });
    expect(asked).toHaveTextContent(
      'Entrants will no longer see “Welcome” on the contest’s page.',
    );
    expect(asked).toHaveTextContent('you can reopen it');
    const list = screen.getAllByRole('list', { name: 'Announcements' })[0]!;
    expect(within(list).queryByText(/· closed/)).toBeNull();
    await userEvent.click(within(asked).getByRole('button', { name: 'Close it' }));

    await waitFor(() => expect(within(list).getByText(/· closed/)).toBeVisible());
    expect(within(list).getByText('Welcome')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();

    await userEvent.click(within(list).getByRole('button', { name: 'Reopen Welcome' }));
    await waitFor(() => expect(within(list).queryByText(/· closed/)).toBeNull());
    expect(within(list).getByRole('button', { name: 'Close Welcome' })).toBeVisible();
  });

  it('reopens a task’s closed announcement at the task, saying closing hides it there', async () => {
    let listed: Announcement[] = [
      announcement({
        closed: true,
        where: { org: 'acme', contest: 'spring', task: 'sum' },
      }),
    ];
    const reopened: string[] = [];
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/tasks/:task/announcements`, () =>
        HttpResponse.json(listed),
      ),
      http.post(
        `${CONTEST_API}/tasks/:task/announcements/:number/reopen`,
        ({ params }) => {
          reopened.push(`${String(params['task'])}/${String(params['number'])}`);
          listed = listed.map((found) => ({ ...found, closed: false }));
          return HttpResponse.json(listed[0]);
        },
      ),
    );
    renderApp('/orgs/acme/contests/spring/tasks/sum/announcements');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Reopen Welcome' }),
    );
    await waitFor(() => expect(reopened).toEqual(['sum/1']));
    await userEvent.click(await screen.findByRole('button', { name: 'Close Welcome' }));
    expect(
      await screen.findByRole('dialog', { name: 'Close this announcement?' }),
    ).toHaveTextContent('on the task’s page or the contest’s');
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
    renderApp('/orgs/acme/contests/spring/announcements');

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

const QUESTION_API = `${CONTEST_API}/clarifications/:asker/:number`;
const INBOX_API = '/api/v1/orgs/:org/clarifications';

/**
 * A list of questions at `list`, the inbox listing the open ones alone, and
 * the routes that change one, keeping what each change did, in order.
 */
function questionRoutes(start: Clarification[], list: string) {
  let listed = start;
  const did: string[] = [];
  const update = (number: unknown, change: Partial<Clarification>) => {
    listed = listed.map((found) =>
      String(found.number) === number ? { ...found, ...change } : found,
    );
    return HttpResponse.json(listed.find((found) => String(found.number) === number));
  };
  server.use(
    signedIn,
    http.get(list, () =>
      HttpResponse.json(
        list === INBOX_API ? listed.filter((found) => !found.answered) : listed,
      ),
    ),
    http.post(`${QUESTION_API}/replies`, async ({ params, request }) => {
      const { body } = (await request.json()) as { body: string };
      did.push(`reply ${String(params.number)}`);
      const found = listed.find((each) => String(each.number) === params.number);
      return update(params.number, {
        messages: [
          ...(found?.messages ?? []),
          { from_asker: false, body, at: '2026-09-12T09:30:00Z' },
        ],
      });
    }),
    http.put(`${QUESTION_API}/answered`, ({ params }) => {
      did.push(`mark ${String(params.number)}`);
      return update(params.number, { answered: true, closed: true });
    }),
    http.delete(`${QUESTION_API}/answered`, ({ params }) => {
      did.push(`reopen ${String(params.number)}`);
      return update(params.number, { answered: false, closed: false });
    }),
  );
  return did;
}

describe('the inbox', () => {
  it('lists the open questions, and asks before marking one answered with no reply', async () => {
    const did = questionRoutes([question()], INBOX_API);
    renderApp('/orgs/acme/clarifications');

    expect(await screen.findByText('Input size?')).toBeVisible();
    expect(screen.getByText(/Replying marks a question answered/)).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Mark as answered Input size?' }),
    );
    const asked = await screen.findByRole('dialog', {
      name: 'Mark it answered without a reply?',
    });
    expect(asked).toHaveTextContent(
      'The entrant sees it answered with no answer from you',
    );
    expect(did).toEqual([]);
    await userEvent.click(
      within(asked).getByRole('button', { name: 'Mark as answered' }),
    );

    expect(
      await screen.findByText('No questions are waiting for an answer.'),
    ).toBeVisible();
    expect(did).toEqual(['mark 1']);
  });

  it('marks a question answered as the reply goes, unless told not to', async () => {
    const did = questionRoutes(
      [question(), question({ number: 2, title: 'Output format?' })],
      INBOX_API,
    );
    renderApp('/orgs/acme/clarifications');

    const first = await screen.findByRole('form', { name: 'Reply to Input size?' });
    expect(
      within(first).getByRole('checkbox', { name: /Mark it answered/ }),
    ).toBeChecked();
    await userEvent.type(within(first).getByLabelText(/Reply/), 'Up to 10^5.');
    await userEvent.click(within(first).getByRole('button', { name: 'Reply' }));
    await waitFor(() => expect(did).toEqual(['reply 1', 'mark 1']));

    const second = screen.getByRole('form', { name: 'Reply to Output format?' });
    await userEvent.click(
      within(second).getByRole('checkbox', { name: /Mark it answered/ }),
    );
    await userEvent.type(within(second).getByLabelText(/Reply/), 'Looking into it.');
    await userEvent.click(within(second).getByRole('button', { name: 'Reply' }));
    await waitFor(() => expect(did).toEqual(['reply 1', 'mark 1', 'reply 2']));
    expect(await screen.findByText('Looking into it.')).toBeVisible();

    // Replied to already, so marking it asks nothing.
    await userEvent.click(
      screen.getByRole('button', { name: 'Mark as answered Output format?' }),
    );
    await waitFor(() =>
      expect(did).toEqual(['reply 1', 'mark 1', 'reply 2', 'mark 2']),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe("a contest's questions, for its organisers", () => {
  it('puts the open ones first, folds the answered away, and reopens one', async () => {
    const did = questionRoutes(
      [
        question({ number: 1, title: 'Old answered', answered: true, closed: true }),
        question({
          number: 2,
          title: 'Waiting less',
          asked_at: '2026-09-12T09:20:00Z',
        }),
        question({
          number: 3,
          title: 'Waiting long',
          asked_at: '2026-09-12T09:05:00Z',
        }),
      ],
      `${CONTEST_API}/clarifications`,
    );
    renderApp('/orgs/acme/contests/spring/questions');

    const open = await screen.findByRole('list', { name: 'Open questions' });
    const titles = within(open)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('strong')?.textContent);
    expect(titles).toEqual(['Waiting long', 'Waiting less']);
    expect(screen.queryByText('Old answered')).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: 'Show 1 answered question' }),
    );
    const answered = screen.getByRole('list', { name: 'Answered questions' });
    expect(within(answered).getByText('Old answered')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Unmark/ })).toBeNull();
    await userEvent.click(
      within(answered).getByRole('button', { name: 'Reopen Old answered' }),
    );

    await waitFor(() => expect(did).toEqual(['reopen 1']));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Open questions' })).getByText(
          'Old answered',
        ),
      ).toBeVisible(),
    );
  });
});
