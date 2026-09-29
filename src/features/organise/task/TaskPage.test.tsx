import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
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

describe('the task page', () => {
  it('shows the latest publication and that the head is it', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    renderApp(TASK);

    expect(await screen.findByText('Latest publication: 2.')).toBeVisible();
    expect(
      screen.getByText('The files as they stand are the latest publication.'),
    ).toBeVisible();
  });

  it("shows a draft's errors, each with its YAML path", async () => {
    server.use(
      signedIn,
      publicationList,
      ...repoFiles,
      http.get(TASK_API, () => HttpResponse.json(draftTask)),
    );
    renderApp(TASK);

    expect(
      await screen.findByText(/The files as they stand are a draft/),
    ).toBeVisible();
    const errors = screen.getByRole('list', { name: 'Errors' });
    expect(within(errors).getByRole('listitem')).toHaveTextContent(
      'inputs.setter[0].value: There is no file under data/hidden/ in the task.',
    );
  });

  it('says so when nothing is published yet', async () => {
    server.use(
      signedIn,
      ...repoFiles,
      http.get(TASK_API, () =>
        HttpResponse.json({ ...publishedTask, latest: null, draft: true }),
      ),
      http.get(`${TASK_API}/publications`, () => HttpResponse.json([])),
    );
    renderApp(TASK);

    expect(await screen.findByText('Not published yet.')).toBeVisible();
    expect(
      await screen.findByText('None yet. The first valid save publishes.'),
    ).toBeVisible();
    expect(
      screen.getByText(/it was held back, or it has not been saved/),
    ).toBeVisible();
  });

  it('lists the publications newest first, with whether and how each changed grading', async () => {
    server.use(signedIn, taskState, publicationList, ...repoFiles);
    renderApp(TASK);

    const list = await screen.findByRole('list', { name: 'Publications' });
    const [newest, oldest] = Array.from(list.children);
    expect(newest).toHaveTextContent('Publication 2');
    expect(newest).toHaveTextContent('grading unchanged');
    expect(oldest).toHaveTextContent('Publication 1');
    expect(oldest).toHaveTextContent('changed how the task grades');
    expect(within(list).getByText('plans/default.json added')).toBeVisible();
  });

  it('shows skeletons while the state and the publications load', async () => {
    const forever = async () => {
      await delay('infinite');
      return HttpResponse.json({});
    };
    server.use(
      signedIn,
      ...repoFiles,
      http.get(TASK_API, forever),
      http.get(`${TASK_API}/publications`, forever),
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

    expect(await screen.findByText('Not found')).toBeVisible();
    refused = false;
    await userEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]!);
    expect(await screen.findByText('Latest publication: 2.')).toBeVisible();
  });
});
