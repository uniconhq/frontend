import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse, type HttpResponseResolver } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import {
  TASK_API,
  draftTask,
  publications,
  publishedTask,
  repoFiles,
  unchanged,
} from '@/test/organiser';

const WRITE = `${TASK_API}/files/:path`;

/** What a save that grades submissions again does, in the forge's words. */
const REGRADED = {
  results_change: true,
  summary: 'Results change.',
  runs_again: ['4 submissions are graded again: the time limit changes.'],
  scores: ['The leaderboard Standings is counted again.'],
  reading: ['Nothing entrants read changes.'],
};

/** The lines of the list named `name` inside `inside`. */
function linesOf(inside: HTMLElement, name: string): (string | null)[] {
  return within(within(inside).getByRole('list', { name }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

/**
 * The sum task with its state, its publications and its top folder counted,
 * so a test can see that a save fetched each again, and a write answered by
 * `answer`.
 */
type Reads = { state: number; publications: number; tree: number };

function taskBackend(answer: HttpResponseResolver) {
  const reads: Reads = { state: 0, publications: 0, tree: 0 };
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

/** The statement, on its card of the task's page, changed and saved. */
async function changeStatementAndSave() {
  fireEvent.change(await screen.findByRole('textbox', { name: 'Statement source' }), {
    target: { value: 'Write the sum of two numbers.\n Now.' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));
}

async function editAndSave() {
  renderApp('/orgs/acme/contests/spring/tasks/sum?card=statement');
  await changeStatementAndSave();
}

/** Goes to one of the task's pages from the sidebar, as an organiser does. */
async function goTo(section: string) {
  const sidebar = screen.getByRole('group', { name: 'Task' });
  await userEvent.click(within(sidebar).getByRole('link', { name: section }));
}

/**
 * The task's page and its publications read first, then the statement saved
 * from its card, as an organiser comes to it: so the reads the save leaves
 * stale are ones the page has. Answers how often each was read just before
 * the save.
 */
async function readThenEditAndSave(reads: Reads): Promise<Reads> {
  renderApp('/orgs/acme/contests/spring/tasks/sum');
  await screen.findByLabelText('Where the task stands');
  await goTo('Publications');
  await screen.findByRole('list', { name: 'Publications' });
  await goTo('sum');
  await screen.findByLabelText('Where the task stands');
  await screen.findByRole('textbox', { name: 'Statement source' });
  const before = { ...reads };
  await changeStatementAndSave();
  return before;
}

/** The publications page, read again after the save left them stale. */
async function toPublications() {
  await goTo('Publications');
  await screen.findByRole('list', { name: 'Publications' });
}

describe('saving a task file', () => {
  it('shows the publication and what it does, then refetches the task', async () => {
    const { reads, sent } = taskBackend(() =>
      HttpResponse.json({
        number: 3,
        grading_changed: true,
        changes: ['The time limit changes.'],
        notes: [],
        regraded: 4,
        effect: REGRADED,
      }),
    );

    const before = await readThenEditAndSave(reads);

    const status = await screen.findByText('Saved and published as publication 3.');
    const outcome = status.parentElement as HTMLElement;
    expect(outcome).toHaveTextContent('Results change.');
    expect(linesOf(outcome, 'Runs again')).toEqual([
      '4 submissions are graded again: the time limit changes.',
    ]);
    expect(linesOf(outcome, 'Scores')).toEqual([
      'The leaderboard Standings is counted again.',
    ]);
    expect(linesOf(outcome, 'What entrants read')).toEqual([
      'Nothing entrants read changes.',
    ]);
    expect(sent).toEqual([
      {
        content: 'Write the sum of two numbers.\n Now.',
        encoding: 'utf-8',
        token: 'token-statement',
        confirm: false,
        keep_as_draft: false,
      },
    ]);
    // The page in view reads where the task stands again; the publications,
    // once their page is opened.
    await expect.poll(() => reads.state).toBeGreaterThan(before.state);
    await toPublications();
    expect(reads.publications).toBeGreaterThan(before.publications);
  });

  it('says when a publication moves nobody’s result, in the same parts and never that grading is unchanged', async () => {
    taskBackend(() =>
      HttpResponse.json({
        number: 3,
        grading_changed: false,
        changes: [],
        notes: [],
        regraded: 0,
        effect: unchanged,
      }),
    );

    await editAndSave();

    const outcome = (await screen.findByText('Saved and published as publication 3.'))
      .parentElement as HTMLElement;
    expect(outcome).toHaveTextContent("Nobody's result changes.");
    expect(linesOf(outcome, 'Runs again')).toEqual([
      'No submission runs again: the tests and how they run are the same.',
    ]);
    expect(linesOf(outcome, 'Scores')).toEqual(['No score changes.']);
    expect(outcome).not.toHaveTextContent('does not change how the task grades');
    expect(outcome).not.toHaveTextContent('Notes:');
  });

  it('says what a first publication does: nothing runs again, and entrants read it from its release', async () => {
    taskBackend(() =>
      HttpResponse.json({
        number: 1,
        grading_changed: false,
        changes: [],
        notes: [],
        regraded: 0,
        effect: {
          ...unchanged,
          runs_again: [
            "No submission runs again: this is the task's first publication.",
          ],
          scores: ['Points: main is worth up to 100.'],
          reading: ['Entrants read the task from its release.'],
        },
      }),
    );

    await editAndSave();

    const outcome = (await screen.findByText('Saved and published as publication 1.'))
      .parentElement as HTMLElement;
    expect(linesOf(outcome, 'Runs again')).toEqual([
      "No submission runs again: this is the task's first publication.",
    ]);
    expect(linesOf(outcome, 'Scores')).toEqual(['Points: main is worth up to 100.']);
    expect(linesOf(outcome, 'What entrants read')).toEqual([
      'Entrants read the task from its release.',
    ]);
  });

  it('shows the notes a publication makes under a label that says what they are', async () => {
    taskBackend(() =>
      HttpResponse.json({
        number: 3,
        grading_changed: true,
        changes: ['The time limit changes.'],
        notes: [
          'sum shows its hidden results on 15 October 2026, 09:00.',
          'The leaderboard Practice ranks by points but counts none from sum.',
        ],
        regraded: 4,
        effect: REGRADED,
      }),
    );

    await editAndSave();

    const outcome = (await screen.findByText('Saved and published as publication 3.'))
      .parentElement as HTMLElement;
    expect(outcome).toHaveTextContent('About the task as published:');
    expect(linesOf(outcome, 'About the task as published')).toEqual([
      'sum shows its hidden results on 15 October 2026, 09:00.',
      'The leaderboard Practice ranks by points but counts none from sum.',
    ]);
    expect(outcome).not.toHaveTextContent('Notes:');
  });

  it('says nothing of notes when a publication has none', async () => {
    taskBackend(() =>
      HttpResponse.json({
        number: 3,
        grading_changed: false,
        changes: [],
        notes: [],
        regraded: 0,
        effect: unchanged,
      }),
    );

    await editAndSave();

    const outcome = (await screen.findByText('Saved and published as publication 3.'))
      .parentElement as HTMLElement;
    expect(
      within(outcome).queryByRole('list', { name: 'About the task as published' }),
    ).toBeNull();
    expect(outcome).not.toHaveTextContent('graded again');
  });

  it('shows a draft with its errors at their paths, and that the last publication keeps grading', async () => {
    const { reads } = taskBackend(() =>
      HttpResponse.json({
        version: '4d5e6f',
        errors: draftTask.errors,
        held_back: [],
      }),
    );

    const before = await readThenEditAndSave(reads);

    const outcome = (await screen.findByText(/Saved as a draft/))
      .parentElement as HTMLElement;
    expect(outcome).toHaveTextContent(
      'entrants are still graded on the last publication',
    );
    expect(within(outcome).getByRole('list', { name: 'Errors' })).toHaveTextContent(
      'Inputs: setter: There is no file under data/hidden/ in the task.',
    );
    await expect.poll(() => reads.state).toBeGreaterThan(before.state);
  });

  it('asks first during the contest in the words of what the save does, and publishes once confirmed', async () => {
    const { sent } = taskBackend(({ request }) =>
      request
        .clone()
        .json()
        .then((body) =>
          (body as { confirm: boolean }).confirm
            ? HttpResponse.json({
                number: 3,
                grading_changed: true,
                changes: ['The time limit changes.'],
                notes: [],
                regraded: 4,
                effect: REGRADED,
              })
            : problem(409, 'confirmation_required', {
                detail:
                  'The contest is running, so this save asks before it publishes. Publish it, or keep it as a draft.',
                changes: ['The time limit changes.'],
                regrades: 4,
                ...REGRADED,
              }),
        ),
    );

    await editAndSave();

    const alert = await screen.findByRole('alert');
    // The first line, then each part with its lines, then the question.
    expect(alert.textContent).toMatch(
      /^Results change\.Runs again4 submissions .*Scores.*What entrants read.*The contest is running\. Publish this change now\?/,
    );
    expect(linesOf(alert, 'Runs again')).toEqual([
      '4 submissions are graded again: the time limit changes.',
    ]);
    expect(linesOf(alert, 'Scores')).toEqual([
      'The leaderboard Standings is counted again.',
    ]);
    expect(linesOf(alert, 'What entrants read')).toEqual([
      'Nothing entrants read changes.',
    ]);
    expect(alert).not.toHaveTextContent('changes how the task grades');

    await userEvent.click(
      within(alert).getByRole('button', { name: 'Publish the change' }),
    );

    expect(
      await screen.findByText('Saved and published as publication 3.'),
    ).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ ...(sent[0] as object), confirm: true });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks before a statement fix that moves nobody’s result too', async () => {
    taskBackend(() =>
      problem(409, 'confirmation_required', {
        changes: [],
        regrades: 0,
        ...unchanged,
        reading: ['The statement changes.'],
      }),
    );

    await editAndSave();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Nobody's result changes.");
    expect(linesOf(alert, 'What entrants read')).toEqual(['The statement changes.']);
    expect(within(alert).getByRole('button', { name: 'Keep as draft' })).toBeVisible();
  });

  it('names what would change, from a backend that does not yet say what a save does', async () => {
    taskBackend(() =>
      problem(409, 'confirmation_required', {
        changes: ['plans/default.json changed', 'limits.time changed'],
        regrades: 12,
      }),
    );

    await editAndSave();

    const alert = await screen.findByRole('alert');
    expect(linesOf(alert, 'What would change')).toEqual([
      'plans/default.json changed',
      'limits.time changed',
    ]);
    expect(
      within(alert).getByRole('button', { name: 'Publish the change' }),
    ).toBeVisible();
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

    await editAndSave();
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
    expect(screen.getByRole('textbox', { name: 'Statement source' })).toHaveValue(
      'Write the sum of two numbers.\n Now.',
    );
  });
});
