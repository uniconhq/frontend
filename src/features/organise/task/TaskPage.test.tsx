import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { delay, http, HttpResponse } from 'msw';
import { TASK_BUILD_CARDS, TASK_SECTIONS } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import {
  TASK_API,
  draftTask,
  publicationList,
  publishedTask,
  repoFiles,
  taskState,
} from '@/test/organiser';

const TASK = '/orgs/acme/contests/spring/tasks/sum';

function at(iso: string): string {
  return formatDateTime(new Date(iso));
}

describe('the task page', () => {
  it('says what contestants are graded on, under the task’s name', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    renderApp(TASK);

    const status = await screen.findByLabelText('Where the task stands');
    expect(status).toHaveTextContent('Published');
    expect(status).toHaveTextContent(
      `Entrants are graded on publication 2, saved ${at('2026-09-21T10:00:00Z')}.`,
    );
  });

  it('lists what kept the last save from publishing, each where it is', async () => {
    server.use(
      signedIn,
      publicationList,
      ...repoFiles,
      http.get(TASK_API, () => HttpResponse.json(draftTask)),
    );
    renderApp(TASK);

    const status = await screen.findByLabelText('Where the task stands');
    expect(status).toHaveTextContent('Last save has problems');
    expect(status).toHaveTextContent(
      'The last save has problems, so it was kept as a draft and entrants are graded as before.',
    );
    const errors = within(status).getByRole('list', { name: 'Errors' });
    expect(within(errors).getByRole('listitem')).toHaveTextContent(
      'Inputs: setter: There is no file under data/hidden/ in the task.',
    );
  });

  it('says so when nothing is published yet, and when a save was kept back', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(TASK_API, () =>
        HttpResponse.json({ ...publishedTask, latest: null, draft: true }),
      ),
      http.get(`${TASK_API}/publications`, () => HttpResponse.json([])),
    );
    renderApp(TASK);

    const status = await screen.findByLabelText('Where the task stands');
    expect(status).toHaveTextContent(
      'Not published yet, so entrants cannot be graded on it.',
    );
    expect(status).toHaveTextContent(
      'The task is saved and has no problems, but it is not published yet.',
    );
  });

  it('shows a skeleton while where it stands loads', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(TASK_API, async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    renderApp(TASK);

    await screen.findByRole('heading', { name: 'sum', level: 1 });
    expect(screen.getAllByRole('status', { name: 'Loading' }).length).toBeGreaterThan(
      1,
    );
  });

  it('shows the refusal, and tries again on request', async () => {
    let refused = true;
    server.use(
      signedIn,
      publicationList,
      ...repoFiles,
      http.get(TASK_API, () =>
        refused ? problem(404, 'not_found') : HttpResponse.json(publishedTask),
      ),
    );
    renderApp(TASK);

    expect((await screen.findAllByText('Not found'))[0]).toBeVisible();
    refused = false;
    await userEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]!);
    expect(await screen.findByLabelText('Where the task stands')).toHaveTextContent(
      'Entrants are graded on publication 2',
    );
  });

  it('builds the task in order with cards, each leading to where its part is done', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    renderApp(TASK);

    await screen.findByRole('region', { name: 'Workflow' });
    const cards = TASK_BUILD_CARDS.map((card) =>
      screen.getByRole('region', { name: card.label }),
    );
    for (const [at, card] of cards.entries()) {
      const next = cards[at + 1];
      if (next !== undefined) {
        expect(card.compareDocumentPosition(next)).toBe(
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }
    }
    expect(
      await within(screen.getByRole('region', { name: 'Statement' })).findByRole(
        'textbox',
        { name: 'Statement source' },
      ),
    ).toHaveValue('Write the sum of two numbers.\n');
    expect(
      within(screen.getByRole('region', { name: 'Workflow' })).getByRole('combobox', {
        name: 'Version',
      }),
    ).toBeVisible();
    const sidebar = screen.getByRole('group', { name: 'Task' });
    expect(
      TASK_BUILD_CARDS.map((card) =>
        within(sidebar).getByRole('link', { name: card.label }).getAttribute('href'),
      ),
    ).toEqual(TASK_BUILD_CARDS.map((card) => `${TASK}?card=${card.key}`));
  });

  it('gives each section a card in the order the sidebar lists them', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    renderApp(TASK);

    const running = await screen.findByRole('group', { name: 'Running the task' });
    expect(
      within(running)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => within(heading).getByRole('link').getAttribute('href')),
    ).toEqual(TASK_SECTIONS.map((section) => `${TASK}/${section.segment}`));
    const sidebar = screen.getByRole('group', { name: 'Task' });
    expect(
      within(sidebar)
        .getAllByRole('link')
        .slice(1 + TASK_BUILD_CARDS.length)
        .map((link) => link.textContent),
    ).toEqual(TASK_SECTIONS.map((section) => section.label));
    expect(
      await within(screen.getByRole('region', { name: 'Publications' })).findByText(
        /^Entrants are graded on publication 2/,
      ),
    ).toBeVisible();
  });
});

describe('what the task has, under its name', { timeout: 20_000 }, () => {
  /** The sum task with a statement, two groups of tests, and the classic workflow. */
  function readyBackend(state = publishedTask) {
    const tree: Record<string, unknown[]> = {
      tests: ['small', 'large'].map((group) => ({
        path: `tests/${group}`,
        kind: 'directory',
        size: null,
        upload: null,
      })),
      'tests/small': ['1', '2'].map((test) => ({
        path: `tests/small/${test}`,
        kind: 'directory',
        size: null,
        upload: null,
      })),
      'tests/large': [],
    };
    const saves: unknown[] = [];
    server.use(
      signedIn,
      publicationList,
      http.get(TASK_API, () => HttpResponse.json(state)),
      http.get(`${TASK_API}/history`, () =>
        HttpResponse.json([
          {
            version: '2b3c4d5e6f7a8b9c0d1e',
            at: '2026-09-21T10:00:00Z',
            author: 'alice',
            author_id: 3,
            message: 'Save the task',
          },
        ]),
      ),
      http.get(`${TASK_API}/tree`, ({ request }) => {
        const path = new URL(request.url).searchParams.get('path') ?? '';
        return path.startsWith('tests')
          ? HttpResponse.json(tree[path] ?? [])
          : undefined;
      }),
      http.get(`${TASK_API}/workflow-form`, () =>
        HttpResponse.json({
          workflow: 'unicon/classic@v2',
          newer: null,
          problem: null,
          graded: false,
          test: [],
          inputs: [
            {
              id: 'time_limit',
              type: 'number',
              contestant: false,
              options: null,
              per_test: false,
              optional: false,
              title: 'Time limit',
              help: null,
              unit: 'seconds',
            },
          ],
        }),
      ),
      http.post(`${TASK_API}/save`, async ({ request }) => {
        saves.push(await request.json());
        return HttpResponse.json({
          number: 3,
          grading_changed: false,
          changes: [],
          notes: [],
          regraded: 0,
        });
      }),
      ...repoFiles,
    );
    return { saves };
  }

  it('ticks each part that is done and says what each other part lacks, each going to its card', async () => {
    readyBackend();
    renderApp(TASK);

    const row = await screen.findByRole('list', { name: 'What the task has' });
    const items = within(row)
      .getAllByRole('listitem')
      .map((item) => [
        within(item).getByRole('img').getAttribute('aria-label'),
        item.textContent?.slice(1),
      ]);
    expect(items).toEqual([
      ['Done', 'Statement'],
      ['Done', 'Workflow'],
      ['Not done', 'Inputs: Time limit (seconds) needs a value'],
      ['Not done', 'Tests: 2 in 2 groups, large has none'],
      ['Done', 'Scoring: no points, ranked on reported values'],
    ]);
    expect(within(row).getByRole('link', { name: /^Inputs/ })).toHaveAttribute(
      'href',
      `${TASK}?card=inputs`,
    );
  });

  it('says who saved the publication entrants are graded on', async () => {
    readyBackend();
    renderApp(TASK);

    expect(await screen.findByLabelText('Where the task stands')).toHaveTextContent(
      `Entrants are graded on publication 2, saved ${at('2026-09-21T10:00:00Z')} by alice.`,
    );
  });

  it('publishes a draft kept back, as it is, when asked', async () => {
    const { saves } = readyBackend({ ...publishedTask, draft: true });
    renderApp(TASK);

    const status = await screen.findByLabelText('Where the task stands');
    expect(status).toHaveTextContent(
      'The last save was kept as a draft, so entrants are graded as before.',
    );
    await userEvent.click(within(status).getByRole('button', { name: 'Publish it' }));

    expect(
      await screen.findByText('Saved and published as publication 3.'),
    ).toBeVisible();
    expect(saves).toEqual([{ changes: [], confirm: false, keep_as_draft: false }]);
  });
});

describe("the task's publications", () => {
  it('lists them newest first, with whether and how each changed grading', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    renderApp(`${TASK}/publications`);

    const list = await screen.findByRole('list', { name: 'Publications' });
    const [newest, oldest] = Array.from(list.children);
    expect(newest).toHaveTextContent('Publication 2');
    expect(newest).toHaveTextContent('grades the same as the one before');
    expect(oldest).toHaveTextContent('Publication 1');
    expect(oldest).toHaveTextContent('changed how submissions are graded');
    expect(within(list).getByText('plans/default.json added')).toBeVisible();
  });

  it('says so when there are none yet', async () => {
    server.use(
      signedIn,
      taskState,
      http.get(`${TASK_API}/publications`, () => HttpResponse.json([])),
    );
    renderApp(`${TASK}/publications`);

    expect(
      await screen.findByText(
        'None yet. The first save without problems publishes the task.',
      ),
    ).toBeVisible();
  });
});
