import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { afterAnswers, problem, server, signedIn, signedInAs } from '@/test/server';
import {
  CONTEST_API,
  contestSettings,
  repoFiles,
  taskList,
  fileContent,
} from '@/test/organiser';
import { comeBackToTab, fakeLiveStream, openStream, realLiveStream } from '@/test/live';
import { isoOf } from './times';

const CONTEST = {
  name: 'Spring',
  description: 'A short paragraph',
  start: '2026-06-01T09:00:00Z',
  end: '2026-06-01T14:00:00Z',
  state: 'draft',
  visibility: 'signed-in',
  registration: { capacity: 100 },
  leaderboards: [
    { key: 'standings', title: 'Standings', audience: { who: 'entrants' } },
  ],
  tasks: [{ id: 'sum' }, { id: 'sort', withdrawn: true }],
};

const SETTINGS = `${CONTEST_API}/settings`;
const PAGE = '/orgs/acme/contests/spring/settings';

/** The spring contest with its settings holding `current`, as `contestSettings` keeps them. */
function contestBackend(
  options: Parameters<typeof contestSettings>[0] & { file?: string } = {},
) {
  const backend = contestSettings({ current: CONTEST, ...options });
  const file = fileContent({
    path: 'contest.yaml',
    content: options.file ?? 'name: Spring\n',
    token: 'token-1',
  });
  server.use(
    signedIn,
    taskList,
    ...backend.handlers,
    http.get(`${CONTEST_API}/files/:path`, ({ params }) =>
      params['path'] === 'contest.yaml' ? HttpResponse.json(file) : undefined,
    ),
    ...repoFiles,
  );
  return backend;
}

/** Set a field's value at once, as a paste would. */
function fill(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

/** The fields of one section of the form, found by its title. */
function inBox(form: HTMLElement, name: string | RegExp) {
  return within(within(form).getByRole('group', { name }));
}

async function openForm() {
  renderApp(PAGE);
  return screen.findByRole('form', { name: 'Contest settings' });
}

describe('the contest settings form', { timeout: 20_000 }, () => {
  it('holds the settings in sections, each saying what it is for', async () => {
    contestBackend();
    const form = await openForm();

    expect(
      within(form)
        .getAllByRole('group')
        .filter((group) => group.tagName === 'FIELDSET')
        .map((group) => group.querySelector('legend')?.textContent),
    ).toEqual(['Basics', 'Who sees it', 'Schedule', 'Teams']);
    expect(within(form).queryByLabelText('State')).toBeNull();
    expect(screen.getByRole('link', { name: 'View file' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/settings#file',
    );
  });

  it('lets an admin change every setting here, and sends every value with those changed', async () => {
    const { sent } = contestBackend();
    const form = await openForm();

    fill(inBox(form, 'Basics').getByLabelText('Name'), 'Spring 2026');
    fill(
      inBox(form, 'Basics').getByLabelText('Description'),
      'Two lines\nof description',
    );
    fill(inBox(form, 'Schedule').getByLabelText(/^Start/), '2026-06-01T10:00');
    fill(inBox(form, 'Schedule').getByLabelText(/^End/), '2026-06-01T23:30');
    const teams = inBox(form, 'Teams');
    await userEvent.click(teams.getByRole('radio', { name: 'In teams' }));
    fill(teams.getByLabelText('Most people in a team'), '3');
    fill(teams.getByLabelText('Fewest people in a team'), '2');
    await userEvent.click(
      teams.getByRole('radio', { name: 'At a team’s first submission' }),
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Saved.')).toBeVisible();
    expect(sent).toHaveLength(1);
    const [write] = sent;
    expect(write?.token).toBe('token-1');
    expect(write?.values).toEqual({
      ...CONTEST,
      name: 'Spring 2026',
      description: 'Two lines\nof description',
      start: isoOf('2026-06-01T10:00'),
      end: isoOf('2026-06-01T23:30'),
      entrants: { most: 3, fewest: 2, locks: 'first_submission' },
    });
  });

  it('asks before leaving with changes not saved, and leaves at once after the save', async () => {
    contestBackend();
    const { router } = renderApp(PAGE);
    const form = await screen.findByRole('form', { name: 'Contest settings' });
    const away = '/orgs/acme/contests/spring';

    fill(inBox(form, 'Basics').getByLabelText('Name'), 'Spring 2026');
    await act(() => router.navigate(away));
    const asking = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    expect(asking).toHaveTextContent('Your changes to the settings are not saved.');
    await userEvent.click(within(asking).getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe(PAGE);

    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Saved.');
    await act(() => router.navigate(away));
    await waitFor(() => expect(router.state.location.pathname).toBe(away));
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeNull();
  });

  it('takes the team settings away when people enter alone again', async () => {
    const { sent } = contestBackend({
      current: { ...CONTEST, entrants: { most: 3, fewest: 2 } },
    });
    const form = await openForm();

    await userEvent.click(inBox(form, 'Teams').getByRole('radio', { name: 'Alone' }));
    expect(inBox(form, 'Teams').queryByLabelText('Most people in a team')).toBeNull();
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    await screen.findByText('Saved.');
    expect(sent[0]?.values).toEqual(CONTEST);
  });

  it('offers nothing for a grading that fails', async () => {
    contestBackend();
    const form = await openForm();

    expect(within(form).queryByText(/grading fails/i)).toBeNull();
  });

  it('sends a fewest over the most, and opens the field the save refused', async () => {
    const { sent } = contestBackend({
      current: { ...CONTEST, entrants: { most: 3 } },
    });
    const message = 'This must be at most 3, the most people in a team.';
    server.use(
      http.put(SETTINGS, async ({ request }) => {
        sent.push((await request.json()) as (typeof sent)[number]);
        return problem(422, 'invalid_definition', {
          errors: [{ path: ['entrants', 'fewest'], message }],
        });
      }),
    );
    const user = userEvent.setup();
    const form = await openForm();

    fill(inBox(form, 'Teams').getByLabelText('Fewest people in a team'), '4');
    await user.click(within(form).getByRole('button', { name: 'Save settings' }));

    const alert = await screen.findByRole('alert');
    expect(sent[0]?.values).toMatchObject({ entrants: { most: 3, fewest: 4 } });
    expect(alert).toHaveTextContent(
      `Settings, Teams: Fewest people in a team: ${message}`,
    );
    await user.click(
      within(alert).getByRole('link', {
        name: 'Settings, Teams: Fewest people in a team',
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Fewest people in a team')).toHaveFocus(),
    );
  });

  it('shows the notes the boards report once the save is written', async () => {
    contestBackend({ notes: ['Standings counts nothing from sort.'] });
    const form = await openForm();

    fill(inBox(form, 'Basics').getByLabelText('Name'), 'Spring 2026');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Saved.')).toBeVisible();
    const notes = screen.getByRole('list', { name: 'About the leaderboards' });
    expect(
      within(notes).getByText('Standings counts nothing from sort.'),
    ).toBeVisible();
  });

  it("shows a manager the admin's settings read-only and saves the manager's own", async () => {
    const { sent } = contestBackend();
    server.use(...signedInAs('manager'));
    const form = await openForm();

    expect(inBox(form, 'Basics').getByLabelText('Name')).toBeDisabled();
    expect(inBox(form, 'Basics').getByLabelText('Description')).toHaveAttribute(
      'readonly',
    );
    expect(screen.getByText('Read only')).toBeVisible();

    fill(inBox(form, 'Schedule').getByLabelText(/^End/), '2026-06-01T15:00');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    await screen.findByText('Saved.');
    expect(sent[0]?.values).toEqual({ ...CONTEST, end: isoOf('2026-06-01T15:00') });
  });

  it('names a refused setting in words and opens it with the field focused', async () => {
    contestBackend();
    server.use(
      http.put(SETTINGS, () =>
        problem(422, 'invalid_definition', {
          errors: [{ path: ['end'], message: 'Must be after start.' }],
        }),
      ),
    );
    const user = userEvent.setup();
    const form = await openForm();
    fill(inBox(form, 'Schedule').getByLabelText(/^End/), '2026-06-01T08:00');
    await user.click(within(form).getByRole('button', { name: 'Save settings' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t save');
    const link = within(alert).getByRole('link', { name: 'Settings, Schedule: End' });
    expect(link).toHaveAttribute('href', `${PAGE}?field=end`);
    expect(alert).toHaveTextContent('Settings, Schedule: End: Must be after start.');
    await user.click(link);

    await waitFor(() => expect(screen.getByLabelText(/^End/)).toHaveFocus());
  });

  it('names a refused leaderboard by the name the sent settings give it', async () => {
    contestBackend();
    server.use(
      http.put(SETTINGS, () =>
        problem(422, 'invalid_definition', {
          errors: [{ path: ['leaderboards', 'standings', 'sort'], message: 'No.' }],
        }),
      ),
    );
    const form = await openForm();
    fill(inBox(form, 'Basics').getByLabelText('Name'), 'Spring 2026');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByRole('link', { name: 'Leaderboards, Standings: Ranking' }),
    ).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring/leaderboards?field=standings.sort',
    );
  });

  it('says a save someone else beat was not made, and reads theirs on Reload', async () => {
    const theirs = { ...CONTEST, name: 'Their spring' };
    const { sent } = contestBackend({ conflictWith: theirs });
    const form = await openForm();

    fill(inBox(form, 'Basics').getByLabelText('Name'), 'My spring');
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nothing was saved');
    expect(sent).toHaveLength(1);
    expect(screen.queryByRole('list', { name: 'Fields that differ' })).toBeNull();

    await userEvent.click(
      within(alert).getByRole('button', { name: 'Reload the file' }),
    );
    await waitFor(() =>
      expect(
        inBox(
          screen.getByRole('form', { name: 'Contest settings' }),
          'Basics',
        ).getByLabelText('Name'),
      ).toHaveValue('Their spring'),
    );
    expect(sent).toHaveLength(1);
  });

  it('says settings that cannot be read cannot be changed, rather than offering the text', async () => {
    contestBackend({ current: null, file: 'name: [Spring\n' });
    renderApp(PAGE);

    expect(
      await screen.findByText(
        'These settings cannot be read, so they cannot be changed here.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Contest settings' })).toBeNull();
    // The text is offered to an admin only where the settings are stored, below.
    const stored = screen.getByRole('region', { name: 'The settings as stored' });
    const texts = await screen.findAllByRole('textbox', { name: 'contest.yaml' });
    expect(texts).toHaveLength(1);
    expect(stored).toContainElement(texts[0] ?? null);
  });
});

describe(
  'the contest settings while they are being changed',
  { timeout: 20_000 },
  () => {
    beforeEach(fakeLiveStream);
    afterEach(realLiveStream);

    it('keeps what was changed, and does not spin, when the tab comes back, and meets someone else’s save at the save', async () => {
      const { sent, elsewhere } = contestBackend();
      const form = await openForm();
      openStream();
      fill(inBox(form, 'Basics').getByLabelText('Name'), 'My spring');

      elsewhere({ ...CONTEST, name: 'Their spring' });
      await afterAnswers(comeBackToTab);

      const now = screen.getByRole('form', { name: 'Contest settings' });
      expect(inBox(now, 'Basics').getByLabelText('Name')).toHaveValue('My spring');
      const save = within(now).getByRole('button', { name: 'Save settings' });
      expect(save).not.toHaveAttribute('data-loading');
      expect(save).toBeEnabled();

      await userEvent.click(save);

      expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was saved');
      expect(sent).toEqual([expect.objectContaining({ token: 'token-1' })]);
    });
  },
);
