import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Announcement, Clarification } from '@/api/types';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';
import { CONTEST_API, TASK_API, home, registration, taskPage } from '@/test/contestant';

const HOME = '/contests/acme/spring';

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

const approvedHome = http.get(`${CONTEST_API}/home`, () =>
  HttpResponse.json(home({ registration: registration({ status: 'approved' }) })),
);

describe('announcements', () => {
  it("shows the contest's open announcements on its home, each task's named", async () => {
    server.use(
      signedIn,
      approvedHome,
      http.get(`${CONTEST_API}/home/announcements`, () =>
        HttpResponse.json([
          announcement(),
          announcement({
            number: 2,
            title: 'On sum',
            where: { org: 'acme', contest: 'spring', task: 'sum' },
          }),
        ]),
      ),
    );
    renderApp(HOME);

    const list = await screen.findByRole('list', { name: 'Announcements' });
    const [newest, oldest] = within(list).getAllByRole('listitem');
    expect(newest).toHaveTextContent('On sum');
    expect(newest).toHaveTextContent('task sum');
    expect(oldest).toHaveTextContent('Welcome');
  });

  it("shows a released task's announcements on its page and nothing when it has none", async () => {
    server.use(
      signedIn,
      http.get(`${TASK_API}/page`, () => HttpResponse.json(taskPage)),
      http.get(`${TASK_API}/submissions`, () => HttpResponse.json([])),
      http.get(`${TASK_API}/page/announcements`, () =>
        HttpResponse.json([announcement({ title: 'Read n first' })]),
      ),
    );
    renderApp(`${HOME}/tasks/sum`);

    expect(await screen.findByText('Read n first')).toBeVisible();
  });
});

describe('questions', () => {
  it('lets an approved contestant ask and read the answers under each question', async () => {
    const asked: unknown[] = [];
    let mine = [
      question({
        messages: [
          { from_asker: false, body: 'Up to 10^5.', at: '2026-09-12T09:20:00Z' },
        ],
      }),
    ];
    server.use(
      signedIn,
      approvedHome,
      http.get(`${CONTEST_API}/questions`, () => HttpResponse.json(mine)),
      http.post(`${CONTEST_API}/questions`, async ({ request }) => {
        asked.push(await request.json());
        const made = question({ number: 2, title: 'And m?' });
        mine = [...mine, made];
        return HttpResponse.json(made, { status: 201 });
      }),
    );
    renderApp(HOME);

    const form = await screen.findByRole('form', { name: 'Ask' });
    await userEvent.type(within(form).getByLabelText(/Question/), 'And m?');
    await userEvent.type(within(form).getByLabelText(/Details/), 'Is m bounded?');
    await userEvent.click(within(form).getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0]).toMatchObject({
      title: 'And m?',
      body: 'Is m bounded?',
      task: null,
    });
    const list = await screen.findByRole('list', { name: 'Your questions' });
    expect(await within(list).findByText('And m?')).toBeVisible();
    expect(within(list).getByText('Up to 10^5.')).toBeVisible();
  });

  it('offers no questions to someone who is not an approved contestant', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () => HttpResponse.json(home())),
    );
    renderApp(HOME);

    await screen.findByRole('heading', { name: 'Tasks' });
    expect(screen.queryByRole('form', { name: 'Ask' })).toBeNull();
  });
});

class FakeSource {
  static last: FakeSource | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, () => void>();
  closed = false;
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeSource.last = this;
  }

  addEventListener(kind: string, listener: () => void) {
    this.listeners.set(kind, listener);
  }

  close() {
    this.closed = true;
  }

  emit(kind: string) {
    this.listeners.get(kind)?.();
  }
}

describe('live updates', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeSource.last = null;
  });

  it('opens one stream per session and refetches what an arriving id names', async () => {
    let asked = 0;
    server.use(
      signedIn,
      approvedHome,
      http.get(`${CONTEST_API}/home/announcements`, () => {
        asked += 1;
        return HttpResponse.json([]);
      }),
    );
    renderApp(HOME);

    await screen.findByRole('heading', { name: 'Tasks' });
    await waitFor(() => expect(asked).toBe(1));
    const source = FakeSource.last;
    expect(source?.url).toBe('/api/v1/live');
    source?.onopen?.();
    source?.emit('grading');
    source?.emit('announcement');

    await waitFor(() => expect(asked).toBe(2));
  });
});
