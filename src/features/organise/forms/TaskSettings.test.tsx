import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { parse } from 'yaml';
import type { DeclaredInput, FileContent, TreeEntry, WorkflowForm } from '@/api/types';
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
  upload: null,
}));

/** A workflow form whose workflow cannot be read, so the form edits the entries there are. */
const UNREAD: WorkflowForm = {
  workflow: 'unicon/checked@v1',
  inputs: [],
  test: [],
  problem: 'The workflow unicon/checked@v1 cannot be read.',
  graded: false,
  newer: null,
};

function declared(
  id: string,
  type: string,
  more: Partial<DeclaredInput> = {},
): DeclaredInput {
  return {
    id,
    type,
    contestant: false,
    options: null,
    per_test: false,
    optional: false,
    ...more,
  };
}

/** What unicon/checked@v1 declares, as the form reads it. */
const CHECKED: WorkflowForm = {
  workflow: 'unicon/checked@v1',
  problem: null,
  graded: false,
  newer: null,
  inputs: [
    declared('submission', 'file', { contestant: true }),
    declared('language', 'enum', {
      contestant: true,
      options: ['cpp', 'python', 'java'],
    }),
    declared('checker', 'file'),
    declared('time_limit', 'number'),
    declared('memory_limit', 'number', { optional: true }),
    declared('strict', 'boolean'),
    declared('greeting', 'text', { optional: true }),
    declared('token', 'text'),
  ],
  test: [
    { name: 'input', type: 'file', options: null },
    { name: 'answer', type: 'file', options: null },
  ],
};

/**
 * The sum task with `task.yaml` as above and three folders under `tests/`,
 * its workflow declaring what `form` says. With `conflictWith`, the first
 * write is refused as a conflict and the file becomes that text, as if
 * someone else had saved it.
 */
function taskBackend(
  answer: () => Response,
  conflictWith?: string,
  form: WorkflowForm = UNREAD,
) {
  let file: FileContent = {
    path: 'task.yaml',
    encoding: 'utf-8',
    content: TASK,
    token: 'token-task',
    upload: null,
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
    http.get(`${TASK_API}/workflow-form`, () => HttpResponse.json(form)),
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
        regraded: 0,
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

  it('says a newer version of the workflow exists and names it only when asked', async () => {
    const { sent } = taskBackend(
      () =>
        HttpResponse.json({
          number: 4,
          grading_changed: true,
          changes: [],
          notes: [],
          regraded: 0,
        }),
      undefined,
      { ...CHECKED, newer: 'v3' },
    );
    asManager();
    const form = await openForm();

    const notice = await within(form).findByRole('status');
    expect(notice).toHaveTextContent(
      'unicon/checked has a newer version, v3. This task grades with unicon/checked@v1 until unicon/checked@v3 is named here and the task is saved.',
    );
    expect(sent).toEqual([]);
    await userEvent.click(
      within(notice).getByRole('button', { name: 'Name unicon/checked@v3' }),
    );

    expect(within(form).getByLabelText('Workflow')).toHaveValue('unicon/checked@v3');
    expect(sent).toEqual([]);
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

  it("builds the inputs from the workflow's declarations and writes each as its type", async () => {
    const { sent } = taskBackend(
      () =>
        HttpResponse.json({
          number: 4,
          grading_changed: false,
          changes: [],
          notes: [],
          regraded: 0,
        }),
      undefined,
      CHECKED,
    );
    asManager();
    const form = await openForm();
    const inputs = within(form).getByRole('list', { name: 'Inputs' });

    expect(within(form).queryByLabelText("New input's id")).toBeNull();
    expect(
      within(form).queryByRole('button', { name: /Make .* the contestant's/ }),
    ).toBeNull();
    expect(
      within(form).getByText('Each test holds: input (file), answer (file).'),
    ).toBeVisible();
    expect(within(inputs).getByLabelText('submission max size')).toBeVisible();
    expect(within(inputs).queryByLabelText('submission default')).toBeNull();
    expect(within(inputs).queryByLabelText('time_limit min')).toBeNull();
    expect(
      within(inputs).getByText(/the save refuses the task until it has a value/),
    ).toBeVisible();

    const options = within(inputs).getByRole('group', { name: 'language options' });
    expect(within(options).getByRole('checkbox', { name: 'cpp' })).toBeChecked();
    expect(within(options).getByRole('checkbox', { name: 'java' })).not.toBeChecked();
    fireEvent.click(within(options).getByRole('checkbox', { name: 'java' }));
    fill(within(inputs).getByLabelText('time_limit value'), '3');
    fireEvent.click(
      within(inputs).getByRole('button', { name: 'Give memory_limit a value' }),
    );
    fireEvent.click(
      within(inputs).getByRole('button', { name: 'Give strict a value' }),
    );
    fireEvent.click(
      within(inputs).getByRole('button', { name: 'Give greeting a value' }),
    );
    fill(within(inputs).getByLabelText('memory_limit value'), '256');
    fill(within(inputs).getByLabelText('strict value'), 'true');
    fill(within(inputs).getByLabelText('greeting value'), '42');
    expect(
      within(inputs).getByRole('checkbox', { name: 'token: a secret of the org' }),
    ).toBeChecked();
    fireEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Published as publication 4.')).toBeVisible();
    const saved = parse(sent[0]?.content ?? '') as { inputs: Record<string, unknown> };
    expect(saved.inputs).toEqual({
      submission: { label: 'Your solution', max_size: '1MB' },
      language: { options: ['cpp', 'python', 'java'], default: 'cpp' },
      checker: 'checker/checker.cpp',
      time_limit: 3,
      token: { secret: 'judge-token' },
      memory_limit: 256,
      strict: true,
      greeting: '42',
    });
  });

  it('leaves out a contestant input, and offers to remove one the workflow does not declare', async () => {
    const { sent } = taskBackend(
      () =>
        HttpResponse.json({
          number: 4,
          grading_changed: false,
          changes: [],
          notes: [],
          regraded: 0,
        }),
      undefined,
      { ...CHECKED, inputs: CHECKED.inputs.filter((input) => input.id !== 'token') },
    );
    asManager();
    const form = await openForm();
    const inputs = within(form).getByRole('list', { name: 'Inputs' });

    expect(within(inputs).getByText(/declares no input with this id/)).toBeVisible();
    expect(
      within(inputs).queryByRole('button', { name: 'Leave checker out' }),
    ).toBeNull();
    fireEvent.click(within(inputs).getByRole('button', { name: 'Remove token' }));
    fireEvent.click(
      within(inputs).getByRole('button', { name: 'Leave submission out' }),
    );
    expect(
      within(inputs).getByRole('button', { name: 'Give submission form details' }),
    ).toBeVisible();
    fireEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Published as publication 4.')).toBeVisible();
    const saved = parse(sent[0]?.content ?? '') as { inputs: Record<string, unknown> };
    expect(Object.keys(saved.inputs)).toEqual(['language', 'checker', 'time_limit']);
  });

  it('writes an input the file holds the other way as the workflow declares it', async () => {
    const { sent } = taskBackend(
      () =>
        HttpResponse.json({
          number: 4,
          grading_changed: false,
          changes: [],
          notes: [],
          regraded: 0,
        }),
      undefined,
      {
        ...CHECKED,
        inputs: CHECKED.inputs.map((input) =>
          input.id === 'time_limit' ? { ...input, contestant: true } : input,
        ),
      },
    );
    asManager();
    const form = await openForm();

    expect(
      within(form).getByText(
        /task.yaml gives it a value, but the contestant gives this one/,
      ),
    ).toBeVisible();
    const save = within(form).getByRole('button', { name: 'Save settings' });
    expect(save).toBeEnabled();
    fill(within(form).getByLabelText('time_limit max'), '10');
    fireEvent.click(save);

    expect(await screen.findByText('Published as publication 4.')).toBeVisible();
    const saved = parse(sent[0]?.content ?? '') as { inputs: Record<string, unknown> };
    expect(saved.inputs['time_limit']).toEqual({ max: 10 });
  });

  it('builds the form after a save from the workflow the save named', async () => {
    const published = () =>
      HttpResponse.json({
        number: 4,
        grading_changed: true,
        changes: [],
        notes: [],
        regraded: 0,
      });
    const { sent } = taskBackend(published, undefined, CHECKED);
    // The new workflow takes the time limit from the contestant.
    const tunable: WorkflowForm = {
      ...CHECKED,
      workflow: 'my-org/tunable@v1',
      inputs: CHECKED.inputs.map((input) =>
        input.id === 'time_limit' ? { ...input, contestant: true } : input,
      ),
    };
    server.use(
      http.get(`${TASK_API}/workflow-form`, () =>
        HttpResponse.json(sent.length === 0 ? CHECKED : tunable),
      ),
    );
    asManager();
    const form = await openForm();
    expect(within(form).getByLabelText('time_limit value')).toBeVisible();

    fill(within(form).getByLabelText('Workflow'), 'my-org/tunable@v1');
    fireEvent.click(within(form).getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Published as publication 4.')).toBeVisible();

    const after = await screen.findByRole('form', { name: 'Task settings' });
    expect(
      await within(after).findByText(
        /task.yaml gives it a value, but the contestant gives this one/,
      ),
    ).toBeVisible();
    expect(within(after).queryByLabelText('time_limit value')).toBeNull();
    expect(within(after).getByLabelText('time_limit max')).toBeVisible();
  });

  it("removes a declared input's key when its value is cleared", async () => {
    const { sent } = taskBackend(
      () =>
        HttpResponse.json({
          number: 4,
          grading_changed: true,
          changes: [],
          notes: [],
          regraded: 0,
        }),
      undefined,
      CHECKED,
    );
    asManager();
    const form = await openForm();

    fill(within(form).getByLabelText('time_limit value'), '');
    fireEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Published as publication 4.')).toBeVisible();
    const saved = parse(sent[0]?.content ?? '') as { inputs: Record<string, unknown> };
    expect(saved.inputs).not.toHaveProperty('time_limit');
  });

  it("says why the workflow's inputs could not be read, and edits the entries there are", async () => {
    taskBackend(() => HttpResponse.json({}));
    const form = await openForm();

    expect(
      within(form).getByText(/The workflow unicon\/checked@v1 cannot be read\./),
    ).toBeVisible();
    expect(within(form).getByLabelText("New input's id")).toBeVisible();
  });

  it('shows a task.yaml that is an upload by its size and digest, not as a form', async () => {
    taskBackend(() => HttpResponse.json({}));
    server.use(
      http.get(`${TASK_API}/files/:path`, ({ params }) =>
        params['path'] === 'task.yaml'
          ? HttpResponse.json({
              path: 'task.yaml',
              encoding: 'utf-8',
              content: `version https://git-lfs.github.com/spec/v1
oid sha256:${'d'.repeat(64)}
size 120
`,
              token: 'token-task',
              upload: { size: 120, digest: 'd'.repeat(64) },
            })
          : undefined,
      ),
    );
    renderApp('/orgs/acme/contests/spring/tasks/sum');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit the settings' }),
    );

    const [shown] = await screen.findAllByRole('region', {
      name: 'Uploaded task.yaml',
    });
    expect(within(shown!).getByText('d'.repeat(64))).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Task settings' })).toBeNull();
  });

  it('requires the show of a group the save adds once the task is graded, and of no other', async () => {
    const { sent } = taskBackend(
      () =>
        HttpResponse.json({
          number: 4,
          grading_changed: true,
          changes: [],
          notes: [],
          regraded: 0,
        }),
      undefined,
      { ...UNREAD, graded: true },
    );
    const form = await openForm();
    const show = (group: string) =>
      within(form).getByRole('combobox', { name: new RegExp(`^${group} show`) });
    const [added, kept, empty] = [show('large'), show('small'), show('samples')];
    expect(added).toBeRequired();
    expect(added).toHaveAccessibleDescription(
      'Required: the task has graded submissions, so a group the save adds must say what it shows.',
    );
    expect(kept).not.toBeRequired();
    expect(empty).not.toBeRequired();
    expect(
      within(empty).getByRole('option', { name: 'Not set (always)' }),
    ).toBeVisible();

    fill(within(form).getByLabelText('small pass at'), '0.5');
    const save = within(form).getByRole('button', { name: 'Save settings' });
    expect(save).toBeDisabled();
    fill(added, 'verdict');
    expect(save).toBeEnabled();
    fireEvent.click(save);

    expect(await screen.findByText('Published as publication 4.')).toBeVisible();
    const written = parse(sent[0]?.content ?? '') as { test_groups: object };
    expect(written.test_groups).toEqual({
      samples: {},
      small: { pass: 30, show: 'verdict', pass_at: 0.5 },
      old: { each: 5 },
      large: { show: 'verdict' },
    });
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
          regraded: 0,
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
