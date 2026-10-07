import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { parse } from 'yaml';
import type { FileContent, TreeEntry } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import {
  TASK_API,
  draftTask,
  publicationList,
  repoFiles,
  taskState,
} from '@/test/organiser';

const TASK = `name: Shortest Path   # the title
workflow: unicon/checked@v1
inputs:
  submission: {label: Your solution, max_size: 1MB}
  language: {options: [cpp, python], default: cpp}
  checker: checker/checker.cpp
  time_limit: 2
  token: {secret: judge-token}
credit: fraction
test_groups:
  samples: {}
  small: {pass: 30, show: verdict}
  old: {each: 5}
submissions:
  max: 50
  rate: {count: 1, per: 30}
`;

const TESTS: TreeEntry[] = ['samples', 'small', 'large'].map((group) => ({
  path: `tests/${group}`,
  kind: 'directory',
  size: null,
}));

/**
 * The sum task with `task.yaml` as above and three folders under `tests/`.
 * With `conflictWith`, the first write is refused as a conflict and the file
 * becomes that text, as if someone else had saved it.
 */
function taskBackend(answer: () => Response, conflictWith?: string) {
  let file: FileContent = {
    path: 'task.yaml',
    encoding: 'utf-8',
    content: TASK,
    token: 'token-task',
  };
  const sent: { content: string; token: string }[] = [];
  server.use(
    signedIn,
    taskState,
    publicationList,
    http.get(`${TASK_API}/tree`, ({ request }) =>
      new URL(request.url).searchParams.get('path') === 'tests'
        ? HttpResponse.json(TESTS)
        : undefined,
    ),
    http.get(`${TASK_API}/files/:path`, ({ params }) =>
      params['path'] === 'task.yaml' ? HttpResponse.json(file) : undefined,
    ),
    http.put(`${TASK_API}/files/:path`, async ({ request }) => {
      const body = (await request.json()) as { content: string; token: string };
      sent.push(body);
      if (conflictWith !== undefined && sent.length === 1) {
        file = { ...file, content: conflictWith, token: 'token-theirs' };
        return problem(409, 'conflict');
      }
      file = { ...file, content: body.content, token: `token-${String(sent.length)}` };
      return answer();
    }),
    ...repoFiles,
  );
  return { sent };
}

function asManager() {
  server.use(
    http.get('/api/v1/me', () =>
      HttpResponse.json({
        ...someone,
        roles: [
          { names: { org: 'acme', contest: 'spring', task: 'sum' }, role: 'manager' },
        ],
      }),
    ),
  );
}

function fill(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

async function openForm() {
  renderApp('/orgs/acme/contests/spring/tasks/sum');
  await userEvent.click(
    await screen.findByRole('button', { name: 'Edit the settings' }),
  );
  return screen.findByRole('form', { name: 'Task settings' });
}

/**
 * Each test drives a whole task page with a form of many fields, and a query
 * after each change reads all of it again, which takes jsdom far longer than
 * a browser, more so with the rest of the suite running beside it.
 */
describe('the task settings form', { timeout: 20_000 }, () => {
  it("lets a manager edit every manager key and shows the admin's read-only", async () => {
    const { sent } = taskBackend(() =>
      HttpResponse.json({
        number: 4,
        grading_changed: true,
        changes: ['the plan'],
        notes: [],
      }),
    );
    asManager();
    const form = await openForm();
    const field = (name: string) => within(form).getByLabelText(name);

    for (const name of ['Name', 'At most', 'Rate: count', 'Rate: per seconds']) {
      expect(field(name)).toBeDisabled();
    }
    expect(
      within(form).getByText(/A folder under tests\/ with no entry in task.yaml yet/),
    ).toBeVisible();

    // Every field there is from the start is found before the first change,
    // since a query after each change re-reads the whole page.
    const [
      workflow,
      label,
      options,
      checker,
      limit,
      newId,
      credit,
      passAt,
      each,
      show,
    ] = [
      'Workflow',
      'submission label',
      'language options',
      'checker value',
      'time_limit value',
      "New input's id",
      'An accepted test earns',
      'small pass at',
      'large each',
      'large show',
    ].map(field);
    const [removeToken, removeOld, addValue, addDetails, addWeight, save] = [
      'Remove token',
      'Remove old',
      'Add with a value',
      "Add the contestant's",
      'Add a test weight to small',
      'Save settings',
    ].map((name) => within(form).getByRole('button', { name, hidden: true }));
    fill(workflow!, 'unicon/checked@v2');
    fill(label!, 'Your program');
    fill(options!, 'cpp, python, java');
    fill(checker!, 'checker/new.cpp');
    fill(limit!, '3');
    fill(passAt!, '0.8');
    fill(each!, '70');
    fill(show!, 'after_close');
    fill(credit!, 'relative');
    fireEvent.click(removeToken!);
    fireEvent.click(removeOld!);
    fill(newId!, 'memory_limit');
    fireEvent.click(addValue!);
    fill(newId!, 'notes');
    fireEvent.click(addDetails!);
    fireEvent.click(addWeight!);
    const [memory, notes, valueName, test, weight] = [
      'memory_limit value',
      'notes label',
      'Value name',
      'small test',
      'small test weight',
    ].map(field);
    fill(memory!, '256');
    fill(notes!, 'Notes');
    fill(valueName!, 'score');
    fill(test!, '7');
    fill(weight!, '3');
    fireEvent.click(save!);

    expect(await screen.findByText('Published as publication 4.')).toBeVisible();
    expect(sent[0]?.token).toBe('token-task');
    expect(parse(sent[0]?.content ?? '')).toEqual({
      name: 'Shortest Path',
      workflow: 'unicon/checked@v2',
      inputs: {
        submission: { label: 'Your program', max_size: '1MB' },
        language: { options: ['cpp', 'python', 'java'], default: 'cpp' },
        checker: 'checker/new.cpp',
        time_limit: 3,
        memory_limit: 256,
        notes: { label: 'Notes' },
      },
      credit: { relative: 'score' },
      test_groups: {
        samples: {},
        small: { pass: 30, show: 'verdict', pass_at: 0.8, test_weights: { '7': 3 } },
        large: { each: 70, show: 'after_close' },
      },
      submissions: { max: 50, rate: { count: 1, per: 30 } },
    });
    expect(sent[0]?.content).toContain('name: Shortest Path # the title');
    expect(sent[0]?.content).toContain('samples: {}');
  });

  it("lets an admin change the admin's keys, and shows a draft's errors", async () => {
    const { sent } = taskBackend(() =>
      HttpResponse.json({ version: '5e6f', errors: draftTask.errors, held_back: [] }),
    );
    const form = await openForm();
    const field = (name: string) => within(form).getByLabelText(name);

    fill(field('Name'), 'Shortest Paths');
    fill(field('At most'), '20');
    fill(field('Rate: count'), '2');
    fill(field('Rate: per seconds'), '60');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    const outcome = (await screen.findByText(/Saved as a draft/))
      .parentElement as HTMLElement;
    expect(within(outcome).getByRole('list', { name: 'Errors' })).toHaveTextContent(
      'inputs.setter[0].value',
    );
    const saved = parse(sent[0]?.content ?? '') as Record<string, unknown>;
    expect(saved['name']).toBe('Shortest Paths');
    expect(saved['submissions']).toEqual({ max: 20, rate: { count: 2, per: 60 } });
  });

  it('will not save a number field that holds no number', async () => {
    taskBackend(() => HttpResponse.json({}));
    const form = await openForm();

    fill(within(form).getByLabelText('small pass'), 'thirty');

    expect(within(form).getByText('Not a number.')).toBeVisible();
    expect(within(form).getByRole('button', { name: 'Save settings' })).toBeDisabled();
  });

  it('merges field by field when someone else saved the task first', async () => {
    const theirs = TASK.replace('time_limit: 2', 'time_limit: 5');
    const { sent } = taskBackend(
      () =>
        HttpResponse.json({
          number: 5,
          grading_changed: false,
          changes: [],
          notes: [],
        }),
      theirs,
    );
    const form = await openForm();

    fill(within(form).getByLabelText('time_limit value'), '3');
    fill(within(form).getByLabelText('large each'), '70');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    const merge = await screen.findByRole('list', { name: 'Fields that differ' });
    const limit = within(merge).getByRole('radiogroup', {
      name: 'inputs.time_limit (both changed it)',
    });
    await userEvent.click(within(limit).getByRole('radio', { name: 'Now: 5' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Save the merged version' }),
    );

    expect(await screen.findByText('Published as publication 5.')).toBeVisible();
    expect(sent[1]?.token).toBe('token-theirs');
    const saved = parse(sent[1]?.content ?? '') as {
      inputs: Record<string, unknown>;
      test_groups: Record<string, unknown>;
    };
    expect(saved.inputs['time_limit']).toBe(5);
    expect(saved.test_groups['large']).toEqual({ each: 70 });
  });
});
