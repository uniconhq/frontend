import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { GradingResult, Submission, TaskPage } from '@/api/types';
import { serverNow } from '@/lib/time';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import { fakeTimerUser, passTime, withFakeTimers } from '@/test/timers';
import {
  accepted,
  contestantInput,
  grading,
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
      const created = submission(made.length + 1, [grading()]);
      made.push(created);
      byKey.set(body.idempotency_key, created);
      return HttpResponse.json(created, { status: 201 });
    }),
  ];
  return { made, bodies, handlers };
}

const python = () => new File(['print(1)\n'], 'main.py', { type: 'text/x-python' });

/** What the panel should have worked the file above's digest out to. */
const PYTHON_SHA256 =
  'cc42155088fca5730758db72b2a5bca33112a941dfaa2d43098ec422ce4ea213';

describe('the submit panel', () => {
  it('shows one drop zone per file input and a field for each value', async () => {
    server.use(
      signedIn,
      listing([]),
      withPage({
        inputs: [
          contestantInput({ language: ['python', 'cpp'] }),
          contestantInput({
            id: 'weights',
            type: 'file[]',
            label: 'Model weights',
            language: null,
            accept: ['.bin', 'npz'],
            max_size: 1024 * 1024,
          }),
          contestantInput({
            id: 'notes',
            type: 'text',
            label: 'Notes',
            language: null,
          }),
          contestantInput({
            id: 'alpha',
            type: 'number',
            label: 'Alpha',
            language: null,
            min: 0,
            max: 1,
            default: 0.5,
          }),
          contestantInput({
            id: 'fast',
            type: 'boolean',
            label: 'Fast',
            language: null,
          }),
          contestantInput({
            id: 'book',
            type: 'jupyter',
            label: 'Book',
            language: null,
          }),
        ],
      }),
    );
    renderApp(PAGE);

    const form = await screen.findByRole('form', { name: 'Submit' });
    const solution = within(form).getByLabelText('Your solution');
    const weights = within(form).getByLabelText('Model weights');
    expect(form.querySelectorAll('input[type="file"]')).toHaveLength(2);
    expect(solution).not.toHaveAttribute('multiple');
    expect(weights).toHaveAttribute('multiple');
    expect(weights).toHaveAttribute('accept', '.bin,.npz');
    expect(within(form).getByText(/Takes \.bin, npz\. At most 1 MB\./)).toBeVisible();
    expect(
      within(form).getByRole('combobox', { name: 'Language of Your solution' }),
    ).toBeVisible();
    expect(within(form).getByRole('textbox', { name: 'Notes' })).toBeVisible();
    expect(within(form).getByRole('textbox', { name: 'Alpha' })).toHaveValue('0.5');
    expect(within(form).getByRole('checkbox', { name: 'Fast' })).not.toBeChecked();
    expect(within(form).getByText(/also takes a notebook/)).toBeVisible();
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
      submission: {
        uploads: ['00000000-0000-4000-8000-000000000001'],
        language: 'python',
      },
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

  it('asks for a language before sending anything', async () => {
    const store = uploadStore();
    server.use(
      signedIn,
      listing([]),
      withPage({ inputs: [contestantInput({ language: ['python', 'cpp'] })] }),
      ...store.handlers,
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.upload(await screen.findByLabelText('Your solution'), python());
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The submission does not fit the task');
    expect(alert).toHaveTextContent('Your solution: Choose a language.');
    expect(store.seen.slots).toHaveLength(0);
  });

  it('refuses a file over its input’s size in the browser, before any upload', async () => {
    const store = uploadStore();
    server.use(
      signedIn,
      listing([]),
      withPage({ inputs: [contestantInput({ max_size: 4 })] }),
      ...store.handlers,
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.upload(await screen.findByLabelText('Your solution'), python());
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That file is too large');
    expect(alert).toHaveTextContent('A file for this input may be at most 4 bytes.');
    expect(alert).toHaveTextContent('The input: Your solution');
    expect(store.seen.slots).toHaveLength(0);
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
      { reason: 'ended' },
      'The contest has ended for you',
      'This task takes no more submissions from you.',
    ],
    [
      'task_closed',
      { reason: 'submissions_closed' },
      'Submissions are closed',
      'The organisers have closed submissions for this contest.',
    ],
    ['archived', {}, 'The contest is archived', 'they take no submissions'],
    [
      'not_approved',
      {},
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
      { limit: 10 * 1024 * 1024, input: null },
      'That submission is too large',
      'A submission may be at most 10 MB in all.',
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
        errors: [
          { input: 'submission', message: 'Choose one of the languages python.' },
        ],
      },
      'The submission does not fit the task',
      'Your solution: Choose one of the languages python.',
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
      'That file is too large',
      'A file for this input may be at most 1 KB.',
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

  it('offers no submit on a task that takes only a notebook', async () => {
    server.use(
      signedIn,
      listing([]),
      withPage({
        inputs: [
          contestantInput({
            id: 'book',
            type: 'jupyter',
            label: 'Book',
            language: null,
          }),
        ],
      }),
    );
    renderApp(PAGE);

    expect(
      await screen.findByText(
        'This task takes a notebook, which is not submitted from this page.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  it('offers no panel on a task that is closed, and still lists the submissions', async () => {
    server.use(
      signedIn,
      listing([submission(1, [accepted])]),
      withPage({
        release: { released: true, visible: true, open: false, closed: 'ended' },
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

  it('follows a queued submission until its outcome and metrics come back', async () => {
    const fresh = (gradings: GradingResult[]) => ({
      ...submission(1, gradings),
      submitted_at: new Date(serverNow().getTime() - 2_000).toISOString(),
    });
    const turns = [
      [fresh([grading()])],
      [fresh([grading({ status: 'running' })])],
      [fresh([accepted])],
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
    expect(within(list).getByLabelText('Metrics')).toHaveTextContent('points100');
    expect(
      screen
        .getAllByRole('status')
        .some((region) => region.textContent === 'Submission #1: ACCEPTED.'),
    ).toBe(true);

    const settled = asked;
    await passTime(10_000);
    expect(asked).toBe(settled);
  });

  it('lists the newest first, each stage by name when there are several', async () => {
    server.use(
      signedIn,
      withPage({}),
      listing([
        submission(1, [accepted]),
        submission(2, [
          grading({ stage: 'public', status: 'done', outcome: 'wrong_answer' }),
          grading({
            id: '5d2f0c1e-0000-4000-8000-000000000002',
            stage: 'hidden',
            show: 'hidden',
          }),
        ]),
      ]),
    );
    renderApp(PAGE);

    const list = await screen.findByRole('table', { name: 'Your submissions' });
    const rows = within(list).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('#2');
    expect(rows[0]).toHaveTextContent('publicWRONG ANSWER');
    expect(rows[0]).toHaveTextContent('hiddenQUEUED');
    expect(rows[1]).toHaveTextContent('#1');
  });
});

describe('a submission opened from the list', () => {
  it('shows the summary, metrics, tests and log the task shows', async () => {
    server.use(
      signedIn,
      withPage({}),
      listing([submission(1, [accepted])]),
      http.get(`${TASK_API}/submissions/:number`, () =>
        HttpResponse.json(submission(1, [accepted])),
      ),
      http.get(`${TASK_API}/submissions/:number/log`, ({ request }) =>
        new URL(request.url).searchParams.get('stage') === 'default'
          ? new HttpResponse('step compile: ok\n', {
              headers: { 'content-type': 'text/plain; charset=utf-8' },
            })
          : problem(404, 'not_found'),
      ),
    );
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click(await screen.findByRole('link', { name: '#1' }));

    const detail = await screen.findByRole('region', { name: 'Submission 1' });
    expect(await within(detail).findByLabelText('Summary default')).toHaveTextContent(
      'Compiled cleanly.',
    );
    expect(within(detail).getByLabelText('Metrics default')).toHaveTextContent(
      'points100',
    );
    const tests = within(detail).getByRole('table', { name: 'Tests default' });
    const rows = within(tests).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('1ACCEPTED12 ms2.0 MB1');
    expect(rows[2]).toHaveTextContent('2ACCEPTED——1');
    expect(await within(detail).findByLabelText('Log default')).toHaveTextContent(
      'step compile: ok',
    );
  });

  it('lists the files it was made with, each a download through the door', async () => {
    server.use(
      signedIn,
      withPage({}),
      listing([submission(1, [accepted])]),
      http.get(`${TASK_API}/submissions/:number`, () =>
        HttpResponse.json(submission(1, [accepted])),
      ),
      http.get(`${TASK_API}/submissions/:number/files`, () =>
        HttpResponse.json({
          number: 1,
          inputs: {
            submission: {
              files: ['files/submission/my main.py'],
              language: 'python',
              value: null,
            },
            alpha: { files: [], language: null, value: 0.5 },
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

  it('says so when the log is too large to show, and keeps the verdict', async () => {
    server.use(
      signedIn,
      withPage({}),
      listing([submission(1, [accepted])]),
      http.get(`${TASK_API}/submissions/:number`, () =>
        HttpResponse.json(submission(1, [accepted])),
      ),
      http.get(`${TASK_API}/submissions/:number/log`, () =>
        problem(409, 'log_too_large', { limit: 9 * 1024 * 1024 }),
      ),
    );
    renderApp(`${PAGE}?submission=1`);

    const detail = await screen.findByRole('region', { name: 'Submission 1' });
    expect(
      await within(detail).findByText('The log is too large to show'),
    ).toBeVisible();
    expect(within(detail).getByLabelText('Summary default')).toHaveTextContent(
      'Compiled cleanly.',
    );
  });

  it('shows the outcome and metrics alone where the task shows metrics', async () => {
    const metrics = grading({
      status: 'done',
      show: 'metrics',
      outcome: 'wrong_answer',
      metrics: { points: 40 },
    });
    let logs = 0;
    server.use(
      signedIn,
      withPage({}),
      listing([submission(1, [metrics])]),
      http.get(`${TASK_API}/submissions/:number`, () =>
        HttpResponse.json(submission(1, [metrics])),
      ),
      http.get(`${TASK_API}/submissions/:number/log`, () => {
        logs += 1;
        return problem(404, 'not_found');
      }),
    );
    renderApp(`${PAGE}?submission=1`);

    const detail = await screen.findByRole('region', { name: 'Submission 1' });
    expect(await within(detail).findByText('WRONG ANSWER')).toBeVisible();
    expect(within(detail).getByLabelText('Metrics default')).toHaveTextContent(
      'points40',
    );
    expect(within(detail).queryByLabelText('Summary default')).not.toBeInTheDocument();
    expect(within(detail).queryByRole('table')).not.toBeInTheDocument();
    expect(within(detail).queryByLabelText('Log default')).not.toBeInTheDocument();
    expect(logs).toBe(0);
  });

  it('shows the checker’s note and the summary as text, never as markup', async () => {
    const noted = grading({
      ...accepted,
      tests: [
        {
          id: '1',
          outcome: 'wrong_answer',
          time_ms: 3,
          memory_kb: 1024,
          metrics: {},
          message: '<b>line 2</b> differs',
        },
      ],
      summary: '<img src=x onerror="alert(1)">',
      log: false,
    });
    server.use(
      signedIn,
      withPage({}),
      listing([submission(1, [noted])]),
      http.get(`${TASK_API}/submissions/:number`, () =>
        HttpResponse.json(submission(1, [noted])),
      ),
    );
    renderApp(`${PAGE}?submission=1`);

    const tests = await screen.findByRole('table', { name: 'Tests default' });
    expect(within(tests).getByRole('columnheader', { name: 'Note' })).toBeVisible();
    expect(within(tests).getByText('<b>line 2</b> differs')).toBeVisible();
    expect(tests.querySelector('b')).toBeNull();
    expect(screen.getByLabelText('Summary default')).toHaveTextContent(
      '<img src=x onerror="alert(1)">',
    );
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it('shows only the status where the task hides the rest, and reads no log', async () => {
    const hidden = grading({ status: 'done', show: 'hidden' });
    let logs = 0;
    server.use(
      signedIn,
      withPage({}),
      listing([submission(1, [hidden])]),
      http.get(`${TASK_API}/submissions/:number`, () =>
        HttpResponse.json(submission(1, [hidden])),
      ),
      http.get(`${TASK_API}/submissions/:number/log`, () => {
        logs += 1;
        return problem(404, 'not_found');
      }),
    );
    renderApp(`${PAGE}?submission=1`);

    const detail = await screen.findByRole('region', { name: 'Submission 1' });
    expect(await within(detail).findByText('GRADED')).toBeVisible();
    expect(within(detail).queryByLabelText('Summary default')).not.toBeInTheDocument();
    expect(within(detail).queryByLabelText('Metrics default')).not.toBeInTheDocument();
    expect(within(detail).queryByRole('table')).not.toBeInTheDocument();
    expect(within(detail).queryByLabelText('Log default')).not.toBeInTheDocument();
    expect(logs).toBe(0);
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
