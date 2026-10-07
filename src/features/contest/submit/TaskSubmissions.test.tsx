import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { GradingResult, Submission, TaskPage } from '@/api/types';
import { formatExact } from '@/lib/exact';
import { serverNow } from '@/lib/time';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import { fakeTimerUser, passTime, withFakeTimers } from '@/test/timers';
import {
  accepted,
  grading,
  inputField,
  reported,
  submission,
  TASK_API,
  taskPage,
  DOOR_URL,
  uploadStore,
} from '@/test/contestant';

const PAGE = '/contests/acme/spring/tasks/sum';

function withPage(overrides: Partial<TaskPage>) {
  return http.get(`${TASK_API}/page`, () =>
    HttpResponse.json({ ...taskPage, ...overrides }),
  );
}

function listing(submissions: Submission[]) {
  return http.get(`${TASK_API}/submissions`, () => HttpResponse.json(submissions));
}

/**
 * The submissions route taking every submit and listing what it took. A key
 * sent again answers with the submission it made, as the server does.
 */
function submissions(start: Submission[] = []) {
  const made: Submission[] = [...start];
  const bodies: { idempotency_key: string; inputs: Record<string, unknown> }[] = [];
  const byKey = new Map<string, Submission>();
  const handlers = [
    http.get(`${TASK_API}/submissions`, () => HttpResponse.json([...made].reverse())),
    http.post(`${TASK_API}/submissions`, async ({ request }) => {
      const body = (await request.json()) as (typeof bodies)[number];
      bodies.push(body);
      const earlier = byKey.get(body.idempotency_key);
      if (earlier !== undefined) return HttpResponse.json(earlier, { status: 201 });
      const created = submission(made.length + 1, grading());
      made.push(created);
      byKey.set(body.idempotency_key, created);
      return HttpResponse.json(created, { status: 201 });
    }),
  ];
  return { made, bodies, handlers };
}

const python = () => new File(['print(1)\n'], 'main.py', { type: 'text/x-python' });

/** A file as a folder picker gives it: with its path inside the folder chosen. */
function inFolder(path: string, content: string): File {
  const found = new File([content], path.slice(path.lastIndexOf('/') + 1));
  Object.defineProperty(found, 'webkitRelativePath', { value: path });
  return found;
}

/** What the panel should have worked the file above's digest out to. */
const PYTHON_SHA256 =
  'cc42155088fca5730758db72b2a5bca33112a941dfaa2d43098ec422ce4ea213';

describe('the submit panel', () => {
  it('shows a drop zone per file input, a choice for an enum and a field for each value', async () => {
    server.use(
      signedIn,
      listing([]),
      withPage({
        inputs: [
          inputField(),
          inputField({
            id: 'program',
            type: 'folder',
            label: 'Your program',
            max_size: 5 * 1024 * 1024,
          }),
          inputField({
            id: 'answers',
            type: 'file',
            label: 'Your answers',
            per_test: true,
            max_size: 1024 * 1024,
          }),
          inputField({
            id: 'language',
            type: 'enum',
            label: 'language',
            options: ['python'],
          }),
          inputField({
            id: 'level',
            type: 'enum',
            label: 'Level',
            options: ['easy', 'hard'],
          }),
          inputField({ id: 'notes', type: 'text', label: 'Notes' }),
          inputField({
            id: 'alpha',
            type: 'number',
            label: 'Alpha',
            min: 0,
            max: 1,
            default: 0.5,
          }),
          inputField({ id: 'fast', type: 'boolean', label: 'Fast' }),
        ],
      }),
    );
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Submit' });
    const solution = within(form).getByLabelText('Your solution');
    const program = within(form).getByLabelText('Your program');
    expect(form.querySelectorAll('input[type="file"]')).toHaveLength(5);
    expect(solution).not.toHaveAttribute('multiple');
    expect(
      within(form).getByText(/Drop a file here or choose one\. At most 10 MB\./),
    ).toBeVisible();
    expect(program).toHaveAttribute('multiple');
    expect(within(form).getByLabelText('Your program: a folder')).toHaveProperty(
      'webkitdirectory',
      true,
    );
    expect(within(form).getByText(/At most 5 MB in all\./)).toBeVisible();
    expect(within(form).getByLabelText('Your answers: a folder')).toBeInTheDocument();
    expect(within(form).getByText(/One file for each test/)).toBeVisible();
    expect(within(form).getByText('language: python')).toBeVisible();
    expect(within(form).queryByRole('combobox', { name: 'language' })).toBeNull();
    expect(within(form).getByRole('combobox', { name: 'Level' })).toHaveValue('');
    expect(within(form).getByRole('textbox', { name: 'Notes' })).toBeVisible();
    expect(within(form).getByRole('textbox', { name: 'Alpha' })).toHaveValue('0.5');
    expect(within(form).getByRole('checkbox', { name: 'Fast' })).not.toBeChecked();
  });

  it('sends each file to its slot, completes it and makes one submission', async () => {
    const store = uploadStore();
    const made = submissions();
    server.use(signedIn, withPage({}), ...store.handlers, ...made.handlers);
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.upload(await screen.findByLabelText('Your solution'), python());
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Submitted as #1.')).toBeVisible();
    expect(store.seen.slots).toEqual([
      {
        input: 'submission',
        filename: 'main.py',
        size: 9,
        // The browser works the digest out itself, and the forge checks the
        // bytes against it as they arrive.
        sha256: PYTHON_SHA256,
        content_type: 'text/x-python',
      },
    ]);
    expect(store.seen.sent).toEqual([
      { id: '00000000-0000-4000-8000-000000000001', bytes: 9 },
    ]);
    expect(store.seen.completed).toEqual(['00000000-0000-4000-8000-000000000001']);
    expect(made.bodies).toHaveLength(1);
    expect(made.bodies[0]?.idempotency_key).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    expect(made.bodies[0]?.inputs).toEqual({
      submission: { uploads: ['00000000-0000-4000-8000-000000000001'] },
      language: { uploads: [], value: 'python' },
    });

    const list = await screen.findByRole('table', { name: 'Your submissions' });
    expect(within(list).getAllByRole('row')).toHaveLength(2);
    expect(within(list).getByText('QUEUED')).toBeVisible();
    expect(screen.queryByText('main.py')).not.toBeInTheDocument();
  });

  it('sends the same key and the same uploads again after a lost answer', async () => {
    const store = uploadStore();
    const made = submissions();
    let lose = true;
    server.use(
      signedIn,
      withPage({}),
      ...store.handlers,
      http.post(`${TASK_API}/submissions`, async ({ request }) => {
        if (!lose) return undefined;
        lose = false;
        made.bodies.push(
          (await request.clone().json()) as (typeof made.bodies)[number],
        );
        return HttpResponse.error();
      }),
      ...made.handlers,
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.upload(await screen.findByLabelText('Your solution'), python());
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Cannot reach Unicon')).toBeVisible();
    expect(screen.getByLabelText('Your solution: files chosen')).toHaveTextContent(
      'main.py',
    );

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Submitted as #1.')).toBeVisible();
    expect(made.bodies).toHaveLength(2);
    expect(made.bodies[1]?.idempotency_key).toBe(made.bodies[0]?.idempotency_key);
    expect(store.seen.slots).toHaveLength(1);
  });

  it('asks for a choice before sending anything', async () => {
    const store = uploadStore();
    server.use(
      signedIn,
      listing([]),
      withPage({
        inputs: [
          inputField(),
          inputField({
            id: 'language',
            type: 'enum',
            label: 'Language',
            options: ['python', 'cpp'],
          }),
        ],
      }),
      ...store.handlers,
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.upload(await screen.findByLabelText('Your solution'), python());
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The submission does not fit the task');
    expect(alert).toHaveTextContent('Language: Choose one of python, cpp.');
    expect(store.seen.slots).toHaveLength(0);
  });

  it('refuses files over their input’s size in the browser, before any upload', async () => {
    const store = uploadStore();
    server.use(
      signedIn,
      listing([]),
      withPage({ inputs: [inputField({ max_size: 4 })] }),
      ...store.handlers,
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.upload(await screen.findByLabelText('Your solution'), python());
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too large for this input');
    expect(alert).toHaveTextContent(
      'The files for this input may be at most 4 bytes in all.',
    );
    expect(alert).toHaveTextContent('The input: Your solution');
    expect(store.seen.slots).toHaveLength(0);
  });

  it('sends a folder’s files by their paths inside it', async () => {
    const store = uploadStore();
    const made = submissions();
    server.use(
      signedIn,
      withPage({
        inputs: [inputField({ id: 'program', type: 'folder', label: 'Your program' })],
      }),
      ...store.handlers,
      ...made.handlers,
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.upload(await screen.findByLabelText('Your program: a folder'), [
      inFolder('mine/Main.java', 'class Main {}'),
      inFolder('mine/lib/Util.java', 'class Util {}'),
    ]);
    expect(screen.getByLabelText('Your program: files chosen')).toHaveTextContent(
      'lib/Util.java',
    );
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Submitted as #1.')).toBeVisible();
    expect(
      store.seen.slots.map((slot) => (slot as { filename: string }).filename),
    ).toEqual(['Main.java', 'lib/Util.java']);
    expect(made.bodies[0]?.inputs).toEqual({
      program: {
        uploads: [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
        ],
      },
    });
  });

  it('sends a file per test by its name, and says why the server turns one away', async () => {
    const slots: unknown[] = [];
    server.use(
      signedIn,
      listing([]),
      withPage({
        inputs: [
          inputField({
            id: 'answers',
            type: 'file',
            label: 'Your answers',
            per_test: true,
          }),
        ],
      }),
      http.post(`${TASK_API}/uploads`, async ({ request }) => {
        slots.push(await request.json());
        return problem(422, 'invalid_inputs', {
          errors: [
            {
              input: 'answers',
              message: '1.txt is not named for a test, as <group>/<test>.',
            },
          ],
        });
      }),
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.upload(
      await screen.findByLabelText('Your answers'),
      new File(['3'], '1.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Your answers: 1.txt is not named for a test, as <group>/<test>.',
    );
    expect(slots).toEqual([expect.objectContaining({ filename: '1.txt' })]);
  });

  it('reports a failed upload as possibly too large, with nothing half sent', async () => {
    const store = uploadStore();
    const made = submissions();
    server.use(
      signedIn,
      withPage({}),
      http.put(`${DOOR_URL}:upload`, () => new HttpResponse(null, { status: 403 })),
      ...store.handlers,
      ...made.handlers,
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.upload(await screen.findByLabelText('Your solution'), python());
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The upload did not go through');
    expect(alert).toHaveTextContent('may have changed since it was chosen');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove main.py' })).toBeVisible();
    expect(store.seen.completed).toHaveLength(0);
    expect(made.bodies).toHaveLength(0);
  });

  const REFUSALS: [string, Record<string, unknown>, string, string][] = [
    [
      'task_closed',
      { reason: 'closed' },
      'This task has closed for you',
      'It takes no more submissions from you.',
    ],
    ['archived', {}, 'The contest is archived', 'they take no submissions'],
    [
      'not_approved',
      { detail: 'Only an approved contestant of the contest submits to it.' },
      'You are not a contestant here yet',
      'Only an approved contestant',
    ],
    [
      'submission_limit',
      { limit: 50 },
      'You have used every submission',
      'This task takes 50 submissions in all',
    ],
    [
      'rate_limited',
      { rate: '1 per 30s', retry_at: '2999-01-01T00:00:30Z' },
      'That is too soon after your last submission',
      'You can submit again at',
    ],
    [
      'too_large',
      { limit: 10 * 1024 * 1024, input: 'submission' },
      'Too large for this input',
      'The files for this input may be at most 10 MB in all.',
    ],
    [
      'upload_not_yours',
      { uploads: ['x'] },
      'A file is not one you uploaded',
      'Nothing was submitted.',
    ],
    [
      'upload_not_ready',
      { uploads: ['x'] },
      'A file did not arrive whole',
      'Nothing was submitted.',
    ],
    [
      'upload_limit',
      { limit: 200, bytes: 20 * 1024 * 1024 },
      'Too many files are waiting to be submitted',
      'Submit what you have, or try again later.',
    ],
    [
      'invalid_idempotency_key',
      {},
      'That submit could not be sent',
      'Reload the page and submit again.',
    ],
    [
      'invalid_inputs',
      {
        errors: [{ input: 'language', message: 'Must be one of python.' }],
      },
      'The submission does not fit the task',
      'language: Must be one of python.',
    ],
  ];

  it('says each refusal in words, with what it names, and keeps the files', async () => {
    const store = uploadStore();
    let refusal: (typeof REFUSALS)[number] | undefined;
    server.use(
      signedIn,
      listing([]),
      withPage({}),
      ...store.handlers,
      http.post(`${TASK_API}/submissions`, () =>
        refusal === undefined
          ? problem(500, 'internal_error')
          : problem(refusal[0] === 'rate_limited' ? 429 : 409, refusal[0], refusal[1]),
      ),
    );
    const user = userEvent.setup();
    renderApp(PAGE);
    await user.upload(await screen.findByLabelText('Your solution'), python());

    for (const each of REFUSALS) {
      refusal = each;
      const [code, , title, sentence] = each;
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      const alert = await screen.findByRole('alert');
      await waitFor(() => expect(alert, code).toHaveTextContent(title));
      expect(alert, code).toHaveTextContent(sentence);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Your solution: files chosen')).toHaveTextContent(
        'main.py',
      );
    }
    // Sent once, and again after each refusal that says an upload cannot be used.
    expect(store.seen.slots).toHaveLength(3);
  });

  const EARLIER: [string, ReturnType<typeof http.post>, string, string][] = [
    [
      'the slot',
      http.post(`${TASK_API}/uploads`, () =>
        problem(413, 'too_large', { limit: 1024, input: 'submission' }),
      ),
      'Too large for this input',
      'The files for this input may be at most 1 KB in all.',
    ],
    [
      'the completion',
      http.post(`${TASK_API}/uploads/:upload/complete`, () =>
        problem(409, 'upload_not_ready', { uploads: ['x'] }),
      ),
      'A file did not arrive whole',
      'Submit again and the files are sent again.',
    ],
    [
      'an upload the forge does not hold',
      http.post(`${TASK_API}/uploads/:upload/complete`, ({ params }) =>
        HttpResponse.json({
          id: String(params['upload']),
          input: 'submission',
          filename: 'main.py',
          content_type: null,
          size: 9,
          sha256: 'a'.repeat(64),
          status: 'waiting',
        }),
      ),
      'A file did not arrive as it was sent',
      'The forge has not got the file.',
    ],
  ];

  it.each(EARLIER)(
    'says a refusal at %s in words and leaves no file half sent',
    async (_, refusing, title, sentence) => {
      const store = uploadStore();
      const made = submissions();
      server.use(signedIn, withPage({}), refusing, ...store.handlers, ...made.handlers);
      const user = userEvent.setup();
      renderApp(PAGE);

      await user.upload(await screen.findByLabelText('Your solution'), python());
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(title);
      expect(alert).toHaveTextContent(sentence);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.queryByText('Sending your files.')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove main.py' })).toBeEnabled();
      expect(made.bodies).toHaveLength(0);
    },
  );

  it('offers no submit on a task that takes nothing from the contestant', async () => {
    server.use(signedIn, listing([]), withPage({ inputs: [] }));
    renderApp(PAGE);

    expect(
      await screen.findByText('This task takes nothing to submit from this page.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  it('offers no panel on a task that is closed, and still lists the submissions', async () => {
    server.use(
      signedIn,
      listing([submission(1, accepted)]),
      withPage({
        release: { released: true, visible: true, open: false, closed: 'closed' },
      }),
    );
    renderApp(PAGE);

    expect(
      await screen.findByRole('table', { name: 'Your submissions' }),
    ).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Submit' })).not.toBeInTheDocument();
  });
});

describe('the submissions list', () => {
  withFakeTimers();

  it('follows a queued submission until its outcome comes back', async () => {
    const fresh = (graded: GradingResult) => ({
      ...submission(1, graded),
      submitted_at: new Date(serverNow().getTime() - 2_000).toISOString(),
    });
    const turns = [
      [fresh(grading())],
      [fresh(grading({ status: 'running' }))],
      [fresh(accepted)],
    ];
    let asked = 0;
    server.use(
      signedIn,
      withPage({}),
      http.get(`${TASK_API}/submissions`, () => {
        const answer = turns[Math.min(asked, turns.length - 1)];
        asked += 1;
        return HttpResponse.json(answer);
      }),
    );
    renderApp(PAGE);

    const list = await screen.findByRole('table', { name: 'Your submissions' });
    expect(await within(list).findByText('QUEUED')).toBeVisible();
    await passTime(2_000);
    expect(await within(list).findByText('RUNNING')).toBeVisible();
    await passTime(2_000);
    expect(await within(list).findByText('ACCEPTED')).toBeVisible();
    expect(
      screen
        .getAllByRole('status')
        .some((region) => region.textContent === 'Submission #1: ACCEPTED.'),
    ).toBe(true);

    const settled = asked;
    await passTime(10_000);
    expect(asked).toBe(settled);
  });

  it('shows a cancelled submission with the organisers’ sentence and stops following it', async () => {
    const fresh = (graded: GradingResult) => ({
      ...submission(1, graded),
      submitted_at: new Date(serverNow().getTime() - 2_000).toISOString(),
    });
    const turns = [
      [fresh(grading({ status: 'running' }))],
      [
        fresh(
          grading({
            status: 'cancelled',
            reason: 'The checker crashed on every test.',
          }),
        ),
      ],
    ];
    let asked = 0;
    server.use(
      signedIn,
      withPage({}),
      http.get(`${TASK_API}/submissions`, () => {
        const answer = turns[Math.min(asked, turns.length - 1)];
        asked += 1;
        return HttpResponse.json(answer);
      }),
    );
    renderApp(PAGE);

    const list = await screen.findByRole('table', { name: 'Your submissions' });
    expect(await within(list).findByText('RUNNING')).toBeVisible();
    await passTime(2_000);
    expect(await within(list).findByText('CANCELLED')).toBeVisible();
    expect(within(list).getByText('The checker crashed on every test.')).toBeVisible();

    const settled = asked;
    await passTime(10_000);
    expect(asked).toBe(settled);
  });

  it('lists the newest first, each with its verdict and how late it was', async () => {
    server.use(
      signedIn,
      withPage({}),
      listing([
        submission(1, accepted),
        submission(2, grading({ status: 'done', stopped: 'compile_error' })),
        submission(3, grading({ status: 'done', outcome: 'wrong_answer' }), {
          late_days: 2,
        }),
        submission(4, grading({ status: 'running' })),
      ]),
    );
    renderApp(PAGE);

    const list = await screen.findByRole('table', { name: 'Your submissions' });
    const rows = within(list).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^#4.*RUNNING$/),
      expect.stringMatching(/^#3.*2 days lateWRONG ANSWER$/),
      expect.stringMatching(/^#2.*COMPILE ERR$/),
      expect.stringMatching(/^#1.*ACCEPTED$/),
    ]);
  });
});

describe('a submission opened from the list', () => {
  it('shows what the run reported once and each group as the task shows it, or that it did not run', async () => {
    const graded = grading({
      ...accepted,
      groups: [
        ...accepted.groups,
        {
          group: 'large',
          show: 'after_close',
          outcome: null,
          tests: null,
          shown_at: '2026-09-12T11:00:00Z',
          ran: true,
          points: null,
          max: '70',
        },
        {
          group: 'extra',
          show: 'always',
          outcome: null,
          tests: [],
          shown_at: null,
          ran: false,
          points: null,
          max: '0',
        },
      ],
      points: { shown: '100', pending: '70', pending_until: '2026-09-12T11:00:00Z' },
    });
    server.use(
      signedIn,
      withPage({}),
      listing([submission(1, graded)]),
      http.get(`${TASK_API}/submissions/:number`, () =>
        HttpResponse.json(submission(1, graded)),
      ),
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(await screen.findByRole('link', { name: '#1' }));

    const detail = await screen.findByRole('region', { name: 'Submission 1' });
    expect(await within(detail).findByLabelText('log')).toHaveTextContent(
      'Compiled cleanly.',
    );

    const samples = within(detail).getByRole('region', { name: 'Group samples' });
    const tests = within(samples).getByRole('table', { name: 'Tests samples' });
    expect(within(tests).getByRole('columnheader', { name: 'time_ms' })).toBeVisible();
    const rows = within(tests).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent(`samples/1ACCEPTED12${formatExact('2048')}`);
    expect(rows[2]).toHaveTextContent('samples/2ACCEPTED——');
    expect(
      within(detail).getByText(/^100 points, and up to 70 more shown at /),
    ).toBeVisible();

    const main = within(detail).getByRole('region', { name: 'Group main' });
    expect(within(main).getByText('ACCEPTED')).toBeVisible();
    expect(within(main).getByText('100 / 100 points')).toBeVisible();
    expect(within(main).getByText(/^Shown at /)).toBeVisible();
    expect(within(main).queryByRole('table')).toBeNull();

    const large = within(detail).getByRole('region', { name: 'Group large' });
    expect(within(large).getByText(/^Shown at /)).toBeVisible();
    expect(within(large).getByText('of 70 points')).toBeVisible();
    expect(within(large).queryByText('ACCEPTED')).toBeNull();
    expect(within(large).queryByRole('table')).toBeNull();
    expect(within(large).queryByText('Not run on this grading')).toBeNull();

    const extra = within(detail).getByRole('region', { name: 'Group extra' });
    expect(within(extra).getByText('Not run on this grading')).toBeVisible();
    expect(within(extra).queryByRole('table')).toBeNull();
  });

  it('shows a cancelled one as cancelled, in the organisers’ words', async () => {
    const cancelled = grading({
      status: 'cancelled',
      reason: 'The checker crashed on every test.',
    });
    server.use(
      signedIn,
      withPage({}),
      listing([submission(1, cancelled)]),
      http.get(`${TASK_API}/submissions/:number`, () =>
        HttpResponse.json(submission(1, cancelled)),
      ),
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(await screen.findByRole('link', { name: '#1' }));

    const detail = await screen.findByRole('region', { name: 'Submission 1' });
    expect(
      await within(detail).findByText(
        'Cancelled by the organisers: The checker crashed on every test.',
      ),
    ).toBeVisible();
    expect(within(detail).getByText('CANCELLED')).toBeVisible();
    expect(within(detail).getByText(/does not count against the task/)).toBeVisible();
  });

  it('says nothing of the limit for a cancel that carries no sentence', async () => {
    const cancelled = grading({ status: 'cancelled', reason: null });
    server.use(
      signedIn,
      withPage({}),
      listing([submission(1, cancelled)]),
      http.get(`${TASK_API}/submissions/:number`, () =>
        HttpResponse.json(submission(1, cancelled)),
      ),
    );
    renderApp(`${PAGE}?submission=1`);

    const detail = await screen.findByRole('region', { name: 'Submission 1' });
    expect(
      await within(detail).findByText('Cancelled by the organisers.'),
    ).toBeVisible();
    expect(within(detail).queryByText(/does not count against/)).toBeNull();
  });

  it('lists the files it was made with, each a download through the door', async () => {
    server.use(
      signedIn,
      withPage({}),
      listing([submission(1, accepted)]),
      http.get(`${TASK_API}/submissions/:number`, () =>
        HttpResponse.json(submission(1, accepted)),
      ),
      http.get(`${TASK_API}/submissions/:number/files`, () =>
        HttpResponse.json({
          number: 1,
          inputs: {
            submission: { files: ['files/submission/my main.py'], value: null },
            language: { files: [], value: 'python' },
          },
        }),
      ),
    );
    renderApp(`${PAGE}?submission=1`);

    const detail = await screen.findByRole('region', { name: 'Submission 1' });
    const files = await within(detail).findByRole('list', { name: 'Files' });
    expect(within(files).getByRole('link', { name: 'my main.py' })).toHaveAttribute(
      'href',
      '/-/downloads/acme/spring/sum/1/files/submission/my%20main.py',
    );
    expect(within(files).getAllByRole('link')).toHaveLength(1);
  });

  it('shows what stopped the run as its verdict, and its log as text, never as markup', async () => {
    const stopped = grading({
      status: 'done',
      stopped: 'compile_error',
      values: reported({}, { log: '<img src=x onerror="alert(1)">' }),
    });
    server.use(
      signedIn,
      withPage({}),
      listing([submission(1, stopped, { late_days: 1 })]),
      http.get(`${TASK_API}/submissions/:number`, () =>
        HttpResponse.json(submission(1, stopped, { late_days: 1 })),
      ),
    );
    renderApp(`${PAGE}?submission=1`);

    const detail = await screen.findByRole('region', { name: 'Submission 1' });
    expect(await within(detail).findByText('COMPILE ERR')).toBeVisible();
    expect(within(detail).getByText(/, 1 day late$/)).toBeVisible();
    expect(within(detail).getByLabelText('log')).toHaveTextContent(
      '<img src=x onerror="alert(1)">',
    );
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(within(detail).queryByRole('table')).toBeNull();
  });
});

describe('the submit panel with fake timers', () => {
  withFakeTimers();

  it('keeps the submit button busy while the file is sent, so a second click does nothing', async () => {
    const store = uploadStore();
    const made = submissions();
    let release: () => void = () => {};
    server.use(
      signedIn,
      withPage({}),
      http.put(`${DOOR_URL}:upload`, async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return new HttpResponse(null, { status: 200 });
      }),
      ...store.handlers,
      ...made.handlers,
    );
    const user = fakeTimerUser();
    renderApp(PAGE);

    await user.upload(await screen.findByLabelText('Your solution'), python());
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Sending your files.')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'main.py sent' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    release();
    expect(await screen.findByText('Submitted as #1.')).toBeVisible();
    expect(made.bodies).toHaveLength(1);
  });
});
