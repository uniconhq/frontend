import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { TaskStanding } from '@/api/types';
import { formatDateTime } from '@/lib/time';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import {
  CONTEST_API,
  repoFiles,
  standingList,
  standings,
  taskList,
} from '@/test/organiser';

const CONTEST = '/orgs/acme/contests/spring';

function at(iso: string): string {
  return formatDateTime(new Date(iso));
}

describe('the contest page', () => {
  it('lists the tasks in order, each linking to its page, and the contest files', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    renderApp(CONTEST);

    const list = await screen.findByRole('list', { name: 'Tasks' });
    expect([...list.children].map((item) => item.getAttribute('aria-label'))).toEqual([
      'A · sort',
      'B · sum',
    ]);
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/orgs/acme/contests/spring/tasks/sort',
      '/orgs/acme/contests/spring/tasks/sum',
    ]);
    const tree = screen.getByRole('navigation', { name: 'Files' });
    expect(
      await within(tree).findByRole('link', { name: 'contest.yaml' }),
    ).toBeVisible();
  });

  it("shows each task's latest publication and its timeline, defaults resolved", async () => {
    server.use(signedIn, standingList, ...repoFiles);
    renderApp(CONTEST);

    const sort = await screen.findByRole('listitem', { name: 'A · sort' });
    expect(sort).toHaveTextContent(
      `Publication 1, ${at('2026-09-20T10:00:00Z')}, changed how it grades`,
    );
    expect(within(sort).queryByRole('list', { name: 'Errors' })).toBeNull();
    const times = within(sort).getAllByRole('definition');
    expect(times.map((time) => time.textContent)).toEqual([
      at('2026-10-01T09:00:00Z'),
      `${at('2026-10-08T09:00:00Z')}, then 10% off per late day started`,
      at('2026-10-15T09:00:00Z'),
      '100 points',
    ]);
    expect(
      within(sort)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['Released', 'Due', 'Closes', 'Worth']);

    const sum = screen.getByRole('listitem', { name: 'B · sum' });
    expect(sum).toHaveTextContent('No due time');
    expect(sum).toHaveTextContent('No points');
  });

  it('shows a draft with errors beside the publication it sits on, each at its YAML path', async () => {
    server.use(signedIn, standingList, ...repoFiles);
    renderApp(CONTEST);

    const sum = await screen.findByRole('listitem', { name: 'B · sum' });
    expect(sum).toHaveTextContent(
      `Publication 2, ${at('2026-09-21T10:00:00Z')}, grading unchanged`,
    );
    expect(sum).toHaveTextContent(
      'A draft sits on top of it, since its last save did not pass validation:',
    );
    const errors = within(sum).getByRole('list', { name: 'Errors' });
    expect(errors).toHaveTextContent(
      'inputs.setter[0].value: There is no file under data/hidden/ in the task.',
    );
  });

  it('says a task that has never published so, and what it is worth once it has', async () => {
    const fresh: TaskStanding = {
      task: { name: 'max' },
      label: 'C',
      state: {
        head: 'a1',
        latest: null,
        draft: true,
        errors: [{ path: '', message: 'task.yaml is missing.' }],
      },
      timeline: {
        release_at: '2026-10-01T09:00:00Z',
        due: null,
        late_per_day: null,
        closes: '2026-10-15T09:00:00Z',
        worth: null,
      },
    };
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        HttpResponse.json([
          fresh,
          {
            ...fresh,
            task: { name: 'min' },
            label: 'D',
            state: { ...fresh.state, errors: [] },
          },
        ]),
      ),
    );
    renderApp(CONTEST);

    const max = await screen.findByRole('listitem', { name: 'C · max' });
    expect(max).toHaveTextContent('Never published');
    expect(max).toHaveTextContent('Its last save did not pass validation:');
    expect(within(max).getByRole('list', { name: 'Errors' })).toHaveTextContent(
      'the whole file: task.yaml is missing.',
    );
    expect(max).toHaveTextContent('Not known until published');

    const min = screen.getByRole('listitem', { name: 'D · min' });
    expect(min).toHaveTextContent('Never published');
    expect(min).toHaveTextContent(
      'Its files are saved as a draft, kept back from contestants.',
    );
    expect(min).not.toHaveTextContent('sits on top of it');
  });

  it("reads the tasks again once the contest's file is saved, since it holds their times", async () => {
    let reads = 0;
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () => {
        reads += 1;
        return HttpResponse.json(standings);
      }),
      http.put(`${CONTEST_API}/files/:path`, () =>
        HttpResponse.json({ version: '9f8e7d6c5b4a39281706' }),
      ),
    );
    renderApp(`${CONTEST}?file=contest.yaml`);

    const editor = await screen.findByRole('textbox', { name: 'contest.yaml' });
    expect(reads).toBe(1);
    await userEvent.type(editor, 'description: Our spring round\n');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText(/Saved as version/);
    await expect.poll(() => reads).toBe(2);
  });

  it('shows a skeleton while the tasks load', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    renderApp(CONTEST);

    await screen.findByRole('heading', { name: 'spring', level: 1 });
    expect(screen.getAllByRole('status', { name: 'Loading' }).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole('list', { name: 'Tasks' })).not.toBeInTheDocument();
  });

  it('shows the refusal when the tasks may not be listed, and keeps the files', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        problem(403, 'forbidden', {
          detail: 'You need the observer role at acme/spring.',
        }),
      ),
    );
    renderApp(CONTEST);

    expect(
      await screen.findByText('You need the observer role at acme/spring.'),
    ).toBeVisible();
    expect(await screen.findByRole('link', { name: 'contest.yaml' })).toBeVisible();
  });

  it("shows the settings' errors at their paths and lists the tasks by name when the settings do not read", async () => {
    server.use(
      signedIn,
      ...repoFiles,
      taskList,
      // As the backend answers the forge's InvalidDefinition naming contest.yaml.
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        problem(422, 'invalid_definition', {
          title: 'Unprocessable Content',
          detail:
            'contest.yaml has 2 problems; the first is at tasks[0].due: It is not a time with an offset.',
          errors: [
            { path: 'tasks[0].due', message: 'It is not a time with an offset.' },
            { path: '', message: 'end comes before start.' },
          ],
        }),
      ),
    );
    renderApp(CONTEST);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("The contest's settings do not read");
    expect(alert).toHaveTextContent('Mend it under Settings or Files below.');
    const errors = within(alert).getByRole('list', { name: 'Errors' });
    expect(
      within(errors)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'tasks[0].due: It is not a time with an offset.',
      'the whole file: end comes before start.',
    ]);
    const list = await screen.findByRole('list', { name: 'Tasks by name' });
    expect(within(list).getByRole('link', { name: 'sum' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/tasks/sum',
    );
    expect(screen.getByRole('button', { name: 'New task' })).toBeVisible();
  });

  it('shows someone refused the list the tasks their own roles reach', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            {
              names: { org: 'acme', contest: 'spring', task: 'sum' },
              role: 'manager',
            },
            {
              names: { org: 'acme', contest: 'autumn', task: 'max' },
              role: 'manager',
            },
          ],
        }),
      ),
      ...repoFiles,
      http.get(`${CONTEST_API}/organise/tasks`, () =>
        problem(403, 'forbidden', {
          detail: 'You need the observer role at acme/spring.',
        }),
      ),
    );
    renderApp(CONTEST);

    const own = await screen.findByRole('list', { name: 'Your tasks' });
    expect(
      within(own)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([['sum', '/orgs/acme/contests/spring/tasks/sum']]);
  });
});

describe('creating a task', () => {
  /**
   * The standings and the create beside them, as the backend keeps them: the
   * create adds the task to `contest.yaml`'s tasks before it answers, so the
   * standings list it from then on, never published.
   */
  function standingsAndCreate(answer?: () => Response) {
    const listed = [...standings];
    const sent: unknown[] = [];
    server.use(
      http.get(`${CONTEST_API}/organise/tasks`, () => HttpResponse.json(listed)),
      http.post(`${CONTEST_API}/tasks`, async ({ request }) => {
        const refused = answer?.();
        if (refused !== undefined) return refused;
        const body = (await request.json()) as { name: string };
        sent.push(body);
        listed.push({
          task: { name: body.name },
          label: 'C',
          state: { head: 'a1', latest: null, draft: false, errors: [] },
          timeline: {
            release_at: '2026-10-01T09:00:00Z',
            due: null,
            late_per_day: null,
            closes: '2026-10-15T09:00:00Z',
            worth: null,
          },
        });
        return HttpResponse.json({ name: body.name }, { status: 201 });
      }),
    );
    return sent;
  }

  async function submitTask(name: string, title = '') {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New task' }));
    const form = screen.getByRole('form', { name: 'New task' });
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), name);
    if (title !== '') {
      await user.type(within(form).getByRole('textbox', { name: /^Title/ }), title);
    }
    await user.click(within(form).getByRole('button', { name: 'Create task' }));
    return form;
  }

  it('sends the name and title, closes the form and lists the new task', async () => {
    server.use(signedIn, ...repoFiles);
    const sent = standingsAndCreate();
    renderApp(CONTEST);

    const form = await submitTask('max', 'Maximum');

    const list = screen.getByRole('list', { name: 'Tasks' });
    expect(await within(list).findByRole('link', { name: 'max' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/tasks/max',
    );
    expect(within(list).getByRole('listitem', { name: 'C · max' })).toHaveTextContent(
      'Never published',
    );
    expect(sent).toEqual([{ name: 'max', title: 'Maximum' }]);
    expect(form).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New task' })).toHaveFocus();
  });

  it('sends no title when none was given', async () => {
    server.use(signedIn, ...repoFiles);
    const sent = standingsAndCreate();
    renderApp(CONTEST);

    await submitTask('max');

    expect(await screen.findByRole('button', { name: 'New task' })).toBeVisible();
    expect(sent).toEqual([{ name: 'max', title: null }]);
  });

  it('shows a taken name beside the form, keeping what was typed', async () => {
    server.use(signedIn, ...repoFiles);
    standingsAndCreate(() =>
      problem(409, 'conflict', {
        detail: 'The task acme/spring/sum already exists.',
      }),
    );
    renderApp(CONTEST);

    const form = await submitTask('sum');

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'The task acme/spring/sum already exists.',
    );
    expect(within(form).getByRole('textbox', { name: /^Name/ })).toHaveValue('sum');
  });
});
