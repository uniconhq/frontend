import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, type HttpResponseResolver } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import {
  TASK_API,
  draftTask,
  publications,
  publishedTask,
  repoFiles,
} from '@/test/organiser';

const WRITE = `${TASK_API}/files/:path`;

/**
 * The sum task with its state, its publications and its top folder counted,
 * so a test can see that a save fetched each again, and a write answered by
 * `answer`.
 */
function taskBackend(answer: HttpResponseResolver) {
  const reads = { state: 0, publications: 0, tree: 0 };
  const sent: unknown[] = [];
  server.use(
    signedIn,
    http.get(TASK_API, () => {
      reads.state += 1;
      return HttpResponse.json(publishedTask);
    }),
    http.get(`${TASK_API}/publications`, () => {
      reads.publications += 1;
      return HttpResponse.json(publications);
    }),
    http.get(`${TASK_API}/tree`, () => {
      reads.tree += 1;
      return undefined;
    }),
    ...repoFiles,
    http.put(WRITE, async (info) => {
      sent.push(await info.request.clone().json());
      return answer(info);
    }),
  );
  return { reads, sent };
}

async function editAndSave(path = 'statement.md') {
  renderApp(`/orgs/acme/contests/spring/tasks/sum?file=${path}`);
  await userEvent.type(await screen.findByRole('textbox', { name: path }), ' Now.');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
}

describe('saving a task file', () => {
  it('shows the publication and what changed in grading, then refetches the task', async () => {
    const { reads, sent } = taskBackend(() =>
      HttpResponse.json({
        number: 3,
        grading_changed: true,
        changes: ['plans/default.json changed'],
      }),
    );

    await editAndSave();

    const status = await screen.findByText('Published as publication 3.');
    const outcome = status.parentElement as HTMLElement;
    expect(outcome).toHaveTextContent('It changes how the task grades:');
    expect(
      within(outcome).getByRole('list', { name: 'What changed' }),
    ).toHaveTextContent('plans/default.json changed');
    expect(sent).toEqual([
      {
        content: 'Write the sum of two numbers.\n Now.',
        encoding: 'utf-8',
        token: 'token-statement',
        confirm: false,
        keep_as_draft: false,
      },
    ]);
    await expect.poll(() => reads).toEqual({ state: 2, publications: 2, tree: 2 });
  });

  it('says when a publication leaves grading as it was', async () => {
    taskBackend(() =>
      HttpResponse.json({
        number: 3,
        grading_changed: false,
        changes: [],
      }),
    );

    await editAndSave();

    const outcome = (await screen.findByText('Published as publication 3.'))
      .parentElement as HTMLElement;
    expect(outcome).toHaveTextContent('It does not change how the task grades.');
  });

  it('shows a draft with its errors at their paths, and that the last publication keeps grading', async () => {
    const { reads } = taskBackend(() =>
      HttpResponse.json({
        version: '4d5e6f',
        errors: draftTask.errors,
        held_back: [],
      }),
    );

    await editAndSave('task.yaml');

    const outcome = (await screen.findByText(/Saved as a draft/))
      .parentElement as HTMLElement;
    expect(outcome).toHaveTextContent('the last publication keeps grading');
    expect(within(outcome).getByRole('list', { name: 'Errors' })).toHaveTextContent(
      'inputs.setter[0].value: There is no file under data/hidden/ in the task.',
    );
    await expect.poll(() => reads.state).toBe(2);
  });

  it('asks before a grading change during the contest, and publishes once confirmed', async () => {
    const { sent } = taskBackend(({ request }) =>
      request
        .clone()
        .json()
        .then((body) =>
          (body as { confirm: boolean }).confirm
            ? HttpResponse.json({
                number: 3,
                grading_changed: true,
                changes: ['plans/default.json changed'],
              })
            : problem(409, 'confirmation_required', {
                detail: 'The contest is running and this changes how the task grades.',
                changes: ['plans/default.json changed', 'limits.time changed'],
              }),
        ),
    );

    await editAndSave('task.yaml');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'The contest is running and this changes how the task grades.',
    );
    const changes = within(alert).getByRole('list', { name: 'What would change' });
    expect(
      within(changes)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['plans/default.json changed', 'limits.time changed']);

    await userEvent.click(
      within(alert).getByRole('button', { name: 'Publish the change' }),
    );

    expect(await screen.findByText('Published as publication 3.')).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ ...(sent[0] as object), confirm: true });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a grading change as a draft instead, saying what it held back', async () => {
    const { sent } = taskBackend(({ request }) =>
      request
        .clone()
        .json()
        .then((body) =>
          (body as { keep_as_draft: boolean }).keep_as_draft
            ? HttpResponse.json({
                version: '4d5e6f',
                errors: [],
                held_back: ['plans/default.json changed'],
              })
            : problem(409, 'confirmation_required', {
                changes: ['plans/default.json changed'],
              }),
        ),
    );

    await editAndSave('task.yaml');
    await userEvent.click(
      within(await screen.findByRole('alert')).getByRole('button', {
        name: 'Keep as draft',
      }),
    );

    const outcome = (await screen.findByText(/Saved as a draft/))
      .parentElement as HTMLElement;
    expect(within(outcome).getByRole('list', { name: 'Held back' })).toHaveTextContent(
      'plans/default.json changed',
    );
    expect(sent[1]).toEqual({ ...(sent[0] as object), keep_as_draft: true });
  });

  it.each([
    ['reserved_path', 403, { paths: ['plans/default.json'] }, 'plans/default.json'],
    ['admin_only', 403, { keys: ['statement.md'] }, 'statement.md'],
    ['invalid_path', 422, { path: '../other/task.yaml' }, '../other/task.yaml'],
  ])('shows a %s refusal with what it names', async (code, status, members, named) => {
    taskBackend(() =>
      problem(status, code, { detail: `${code} said why`, ...members }),
    );

    await editAndSave();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`${code} said why`);
    expect(
      within(alert).getByRole('list', { name: 'What stands in the way' }),
    ).toHaveTextContent(named);
    expect(screen.getByRole('textbox', { name: 'statement.md' })).toHaveValue(
      'Write the sum of two numbers.\n Now.',
    );
  });
});
