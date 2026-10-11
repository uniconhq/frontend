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
      `Contestants are graded on publication 2, of ${at('2026-09-21T10:00:00Z')}.`,
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
      'The last save did not publish, for these problems:',
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
      'Nothing is published yet, so contestants cannot see the task.',
    );
    expect(status).toHaveTextContent('The last save is kept back as a draft');
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
      'Contestants are graded on publication 2',
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
        /^Contestants are graded on publication 2/,
      ),
    ).toBeVisible();
  });
});

describe("the task's publications", () => {
  it('lists them newest first, with whether and how each changed grading', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    renderApp(`${TASK}/publications`);

    const list = await screen.findByRole('list', { name: 'Publications' });
    const [newest, oldest] = Array.from(list.children);
    expect(newest).toHaveTextContent('Publication 2');
    expect(newest).toHaveTextContent('grading unchanged');
    expect(oldest).toHaveTextContent('Publication 1');
    expect(oldest).toHaveTextContent('changed how the task grades');
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
      await screen.findByText('None yet. The first save without problems publishes.'),
    ).toBeVisible();
  });
});
