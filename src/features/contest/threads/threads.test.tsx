import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import type { Announcement, Clarification } from '@/api/types';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';
import {
  CONTEST_API,
  TASK_API,
  entry,
  home,
  registration,
  taskPage,
} from '@/test/contestant';
import { passTime, withFakeTimers } from '@/test/timers';

const HOME = '/contests/acme/spring';
const QUESTIONS = `${HOME}/questions`;

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

  it('draws a task’s own pictures in its announcements, and none in the contest’s', async () => {
    server.use(
      signedIn,
      approvedHome,
      http.get(`${CONTEST_API}/home/announcements`, () =>
        HttpResponse.json([
          announcement({ body: '![the map](public/map.png)' }),
          announcement({
            number: 2,
            title: 'On sum',
            body: '![the tree](public/tree.png)',
            where: { org: 'acme', contest: 'spring', task: 'sum' },
          }),
        ]),
      ),
    );
    renderApp(HOME);

    expect(await screen.findByRole('img', { name: 'the tree' })).toHaveAttribute(
      'src',
      '/api/v1/orgs/acme/contests/spring/tasks/sum/public/tree.png',
    );
    expect(screen.getByRole('link', { name: 'the map' })).toBeVisible();
  });
});

describe('questions', () => {
  it('lets an approved contestant ask and read the answers under each question', async () => {
    const asked: unknown[] = [];
    let mine = [
      question({
        messages: [
          {
            from_asker: false,
            body: 'Up to 10^5.',
            at: '2026-09-12T09:20:00Z',
            announcement: null,
          },
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
    renderApp(QUESTIONS);

    expect(
      await screen.findByRole('heading', { name: 'Questions', level: 1 }),
    ).toBeVisible();
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
    const answered = within(list).getByRole('article', { name: 'Input size?' });
    const messages = within(answered).getAllByRole('listitem');
    expect(
      messages.map((message) => message.querySelector('strong')?.textContent),
    ).toEqual(['You', 'Organisers']);
    expect(messages[1]).toHaveTextContent('Up to 10^5.');
    expect(within(answered).getByText('Open')).toBeVisible();

    // The follow-up is folded until asked for, and opens in place.
    expect(within(answered).queryByRole('textbox')).toBeNull();
    await userEvent.click(
      within(answered).getByRole('button', { name: 'Follow up Input size?' }),
    );
    expect(within(answered).getByRole('textbox', { name: 'Follow up' })).toHaveFocus();
  });

  const answeredPublicly = http.get(`${CONTEST_API}/questions`, () =>
    HttpResponse.json([
      question({
        answered: true,
        closed: true,
        messages: [
          {
            from_asker: false,
            body: 'Answered publicly in the announcement ‘On n’',
            at: '2026-09-12T09:20:00Z',
            announcement: { task: 'sum', number: 3, title: 'On n' },
          },
        ],
      }),
    ]),
  );

  it('shows a public answer on the asker’s question, linking to its announcement on the contest page (M62)', async () => {
    server.use(
      signedIn,
      approvedHome,
      answeredPublicly,
      http.get(`${CONTEST_API}/home/announcements`, () =>
        HttpResponse.json([
          announcement({
            number: 3,
            title: 'On n',
            where: { org: 'acme', contest: 'spring', task: 'sum' },
          }),
        ]),
      ),
    );
    renderApp(QUESTIONS);

    const link = await screen.findByRole('link', { name: '‘On n’' });
    expect(link).toHaveAttribute('href', '/contests/acme/spring#announcement-sum-3');
    expect(link.closest('p')).toHaveTextContent(
      'Answered publicly in the announcement ‘On n’',
    );
  });

  it('links the whole of a public answer’s message that was edited at the forge, taking no title from its words', async () => {
    server.use(
      signedIn,
      approvedHome,
      http.get(`${CONTEST_API}/questions`, () =>
        HttpResponse.json([
          question({
            answered: true,
            closed: true,
            messages: [
              {
                from_asker: false,
                body: 'Answered in the announcement ‘Bounds’',
                at: '2026-09-12T09:20:00Z',
                announcement: { task: 'sum', number: 3, title: null },
              },
            ],
          }),
        ]),
      ),
      http.get(`${CONTEST_API}/home/announcements`, () =>
        HttpResponse.json([
          announcement({
            number: 3,
            title: 'On n',
            where: { org: 'acme', contest: 'spring', task: 'sum' },
          }),
        ]),
      ),
    );
    renderApp(QUESTIONS);

    const link = await screen.findByRole('link', {
      name: 'Answered in the announcement ‘Bounds’',
    });
    expect(link).toHaveAttribute('href', '/contests/acme/spring#announcement-sum-3');
  });

  it('says a public answer’s announcement was closed rather than link to a page that no longer shows it', async () => {
    server.use(signedIn, approvedHome, answeredPublicly);
    renderApp(QUESTIONS);

    expect(
      await screen.findByText(
        'Answered publicly in the announcement ‘On n’, which the organisers have since closed.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: '‘On n’' })).toBeNull();
  });

  it('says a public answer’s task was withdrawn where that is why its announcement is gone (#450)', async () => {
    const withdrawn = home({ registration: registration({ status: 'approved' }) });
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json({
          ...withdrawn,
          tasks: withdrawn.tasks.map((task) => ({
            ...task,
            release: { ...task.release, open: false, closed: 'withdrawn' },
          })),
        }),
      ),
      answeredPublicly,
    );
    renderApp(QUESTIONS);

    expect(
      await screen.findByText(
        'Answered publicly in the announcement ‘On n’, whose task has since been withdrawn from the contest.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/organisers have since closed/)).toBeNull();
  });

  it('marks a team’s messages as the team’s', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, () =>
        HttpResponse.json(
          home({ registration: { ...registration({ status: 'approved' }), most: 3 } }),
        ),
      ),
      http.get(`${CONTEST_API}/questions`, () =>
        HttpResponse.json([
          question({
            asker: 'entrant.0b9d6a5200004000800000000000001a',
            messages: [
              {
                from_asker: true,
                body: 'And m?',
                at: '2026-09-12T09:15:00Z',
                announcement: null,
              },
            ],
          }),
        ]),
      ),
    );
    renderApp(QUESTIONS);

    const list = await screen.findByRole('list', { name: 'Your questions' });
    expect(await within(list).findAllByText('Your team')).toHaveLength(2);
    expect(
      screen.getByRole('heading', { name: 'Your team’s questions' }),
    ).toBeVisible();
  });

  it('asks about the task a task’s page links from', async () => {
    const asked: unknown[] = [];
    server.use(
      signedIn,
      approvedHome,
      http.post(`${CONTEST_API}/questions`, async ({ request }) => {
        asked.push(await request.json());
        return HttpResponse.json(question({ task: 'sum' }), { status: 201 });
      }),
    );
    renderApp(`${QUESTIONS}?task=sum`);

    const form = await screen.findByRole('form', { name: 'Ask' });
    await userEvent.type(within(form).getByLabelText(/Question/), 'Is n positive?');
    await userEvent.type(within(form).getByLabelText(/Details/), 'Or zero?');
    await userEvent.click(within(form).getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0]).toMatchObject({ task: 'sum' });
  });

  it('names each task it can ask about by its letter and title, as the contest’s page does', async () => {
    server.use(signedIn, approvedHome);
    renderApp(`${QUESTIONS}?task=sum`);

    const form = await screen.findByRole('form', { name: 'Ask' });
    expect(
      within(form).getByRole('combobox', { name: 'About the task' }),
    ).toHaveDisplayValue('A · Sum of Two');
  });

  it('says how many questions were asked and answered on the contest’s page', async () => {
    server.use(
      signedIn,
      approvedHome,
      http.get(`${CONTEST_API}/questions`, () =>
        HttpResponse.json([question(), question({ number: 2, answered: true })]),
      ),
    );
    renderApp(HOME);

    const card = await screen.findByRole('region', {
      name: 'Questions to the organisers',
    });
    expect(await within(card).findByText('2 asked, 1 answered.')).toBeVisible();
    expect(
      within(card).getByRole('link', { name: 'Ask a question or read the answers' }),
    ).toHaveAttribute('href', QUESTIONS);
  });

  it.each([
    [
      'waits for approval',
      { registration: registration() },
      'You can ask the organisers questions once your registration is approved.',
    ],
    [
      'may register',
      {},
      'You can ask the organisers questions once you register for the contest, on its page.',
    ],
    [
      'is refused by the contest’s email rule',
      { registration: entry({ can_register: false }) },
      'Only the contest’s entrants can ask the organisers questions.',
    ],
  ])(
    'offers no questions to someone who %s, saying what is true for them',
    async (_, who, said) => {
      server.use(
        signedIn,
        http.get(`${CONTEST_API}/home`, () => HttpResponse.json(home(who))),
      );
      renderApp(QUESTIONS);

      expect(await screen.findByText(said)).toBeVisible();
      expect(screen.queryByRole('form', { name: 'Ask' })).toBeNull();
    },
  );

  it('asks a visitor to sign in first', async () => {
    renderApp(QUESTIONS);

    expect(
      await screen.findByRole('heading', {
        name: 'Sign in to ask the organisers a question',
      }),
    ).toBeVisible();
  });
});

class FakeSource {
  static readonly CLOSED = 2;
  static last: FakeSource | null = null;
  static made = 0;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, () => void>();
  closed = false;
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeSource.last = this;
    FakeSource.made += 1;
  }

  addEventListener(kind: string, listener: () => void) {
    this.listeners.set(kind, listener);
  }

  close() {
    this.closed = true;
    this.readyState = FakeSource.CLOSED;
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
    FakeSource.made = 0;
    setVisibility('visible');
  });

  function counted() {
    const asked = { count: 0 };
    server.use(
      signedIn,
      approvedHome,
      http.get(`${CONTEST_API}/home/announcements`, () => {
        asked.count += 1;
        return HttpResponse.json([]);
      }),
    );
    return asked;
  }

  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', {
      value: state,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('opens one stream and refetches only what an arriving id names', async () => {
    const asked = counted();
    renderApp(HOME);

    await screen.findByRole('heading', { name: 'Tasks' });
    await waitFor(() => expect(asked.count).toBe(1));
    const source = FakeSource.last;
    expect(source?.url).toBe('/api/v1/live');
    expect(FakeSource.made).toBe(1);
    source?.onopen?.();
    source?.emit('grading');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(asked.count).toBe(1);
    source?.emit('announcement');

    await waitFor(() => expect(asked.count).toBe(2));
  });

  describe('once refused', () => {
    withFakeTimers();

    it('opens a refused stream again later and refetches everything once it opens', async () => {
      const asked = counted();
      renderApp(HOME);
      await screen.findByRole('heading', { name: 'Tasks' });
      await waitFor(() => expect(asked.count).toBe(1));
      const first = FakeSource.last;
      first?.onopen?.();

      if (first) first.readyState = FakeSource.CLOSED;
      first?.onerror?.();

      // The first reopen is 5 s after the refusal (LiveProvider.tsx).
      await passTime(5_000);
      await waitFor(() => expect(FakeSource.made).toBe(2));
      FakeSource.last?.onopen?.();
      await waitFor(() => expect(asked.count).toBe(2));
    });
  });

  it('closes the stream while the tab is hidden and opens it again in front', async () => {
    counted();
    renderApp(HOME);
    await screen.findByRole('heading', { name: 'Tasks' });
    const first = FakeSource.last;

    setVisibility('hidden');
    await waitFor(() => expect(first?.closed).toBe(true));
    setVisibility('visible');

    await waitFor(() => expect(FakeSource.made).toBe(2));
  });
});
