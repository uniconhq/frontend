import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import type { WriteSettings } from '@/api/types';
import { holding } from '@/test/may';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import { invite } from '@/test/invites';
import { CONTEST_API, contestSettings, repoFiles, taskList } from '@/test/organiser';
import { localOf } from '../forms/times';

const PAGE = '/orgs/acme/contests/spring/entry';
const SETTINGS = `${CONTEST_API}/settings`;

const BASE = {
  name: 'Spring',
  start: '2026-06-01T09:00:00Z',
  end: '2026-06-01T14:00:00Z',
  state: 'draft',
  visibility: 'signed-in',
};

/** The contest's settings holding `current`, each save taken; the values each sent. */
function settings(current: Record<string, unknown>) {
  const backend = contestSettings({ current });
  server.use(taskList, ...backend.handlers, ...repoFiles);
  return backend.sent;
}

/** The registration a save sent. */
function registrationOf(sent: WriteSettings | undefined) {
  return sent?.values['registration'] as Record<string, unknown> | undefined;
}

async function openForm(): Promise<HTMLElement> {
  renderApp(PAGE);
  return screen.findByRole('group', { name: 'How people enter' });
}

function way(form: HTMLElement, name: string | RegExp) {
  return within(within(form).getByRole('group', { name }));
}

describe('how people enter', { timeout: 20_000 }, () => {
  it('starts a contest with no ways from a choice, and saves the way it makes', async () => {
    server.use(signedIn);
    const sent = settings(BASE);
    const user = userEvent.setup();
    const form = await openForm();

    expect(
      within(form).getByRole('status', { name: 'What it adds up to' }),
    ).toHaveTextContent(
      'Anyone with an account can register from when the contest opens until the contest ends. An organiser approves each one.',
    );
    await user.click(
      within(form).getByRole('button', { name: 'Students at a domain' }),
    );
    const students = way(form, 'Sign-up: Students');
    expect(
      students.getByRole('radio', { name: 'Approved straight away' }),
    ).toBeChecked();
    fireEvent.change(students.getByLabelText('Email domains'), {
      target: { value: 'u.nus.edu' },
    });
    expect(
      within(form).getByRole('status', { name: 'What it adds up to' }),
    ).toHaveTextContent(
      'Anyone with an @u.nus.edu email can register from when the contest opens until the contest ends. Each is approved straight away.',
    );
    await user.click(
      within(form).getByRole('button', { name: 'Save how people enter' }),
    );

    expect(await screen.findByText('Saved.')).toBeVisible();
    expect(registrationOf(sent[0])).toEqual({
      ways: [
        { signup: { name: 'Students', domains: ['u.nus.edu'], approval: 'auto' } },
      ],
    });
  });

  it('shows each way as a card, invites made right in the invite card', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/invites`, () =>
        HttpResponse.json([
          invite({
            id: 'a',
            username: 'cal',
            grants: 'contestant',
            where: { org: 'acme', contest: 'spring', task: null },
          }),
        ]),
      ),
    );
    settings({
      ...BASE,
      registration: {
        capacity: 200,
        ways: [{ invite: {} }, { signup: { name: 'Guests', code: 'guest-2026' } }],
      },
    });
    const form = await openForm();

    expect(
      within(form).getByRole('status', { name: 'What it adds up to' }),
    ).toHaveTextContent(
      'Anyone you invite, or anyone with the code can register from when the contest opens until the contest ends. Some are approved straight away and others by an organiser, as each way says. At most 200 entrants can register.',
    );
    const invited = way(form, 'People you invite');
    expect(await invited.findByRole('table', { name: 'Invites' })).toHaveTextContent(
      'cal',
    );
    expect(invited.getByRole('form', { name: 'Invite someone' })).toBeVisible();
    const guests = way(form, 'Sign-up: Guests');
    // What the name names, and everyone who reads it (M42).
    const name = guests.getByRole('textbox', { name: 'Name of this sign-up' });
    expect(name).toHaveValue('Guests');
    expect(name).toHaveAttribute('placeholder', 'Such as NUS students');
    expect(name).toHaveAccessibleDescription(
      'Optional. Shown beside each person who came in this way: to you on the Entrants page, and to their teammates.',
    );
    expect(guests.getByRole('checkbox', { name: 'Needs a code' })).toBeChecked();
    expect(guests.getByLabelText('Code')).toHaveValue('guest-2026');
    expect(
      guests.getByRole('radio', { name: 'An organiser approves each one' }),
    ).toBeChecked();
  });

  it('asks for a ticked condition to be filled in before saving', async () => {
    server.use(signedIn);
    settings({ ...BASE, registration: { ways: [{ signup: {} }] } });
    const user = userEvent.setup();
    const form = await openForm();

    await user.click(
      way(form, 'Sign-up').getByRole('checkbox', { name: 'Needs a code' }),
    );

    expect(
      within(form).getByRole('list', { name: 'To fix before saving' }),
    ).toHaveTextContent('Way in 1: enter its code, or untick “Needs a code”.');
    expect(
      within(form).getByRole('button', { name: 'Save how people enter' }),
    ).toBeDisabled();
  });

  it('sends a domain as typed and opens the one the save refused, focused', async () => {
    server.use(signedIn);
    const sent = settings({
      ...BASE,
      registration: { ways: [{ signup: { domains: ['u.nus.edu'] } }] },
    });
    const message =
      'Give a domain such as u.nus.edu, or *.nus.edu.sg to take nus.edu.sg and every domain under it.';
    server.use(
      http.put(SETTINGS, async ({ request }) => {
        sent.push((await request.json()) as WriteSettings);
        return problem(422, 'invalid_definition', {
          errors: [
            { path: ['registration', 'ways', 0, 'signup', 'domains', 0], message },
          ],
        });
      }),
    );
    const user = userEvent.setup();
    const form = await openForm();

    const domains = way(form, 'Sign-up').getByLabelText('Email domains');
    fireEvent.change(domains, { target: { value: '@U.nus.edu' } });
    await user.click(
      within(form).getByRole('button', { name: 'Save how people enter' }),
    );

    const alert = await screen.findByRole('alert');
    expect(registrationOf(sent[0])).toEqual({
      ways: [{ signup: { domains: ['@U.nus.edu'] } }],
    });
    const link = within(alert).getByRole('link', {
      name: 'How people enter, way 1: Email domains',
    });
    expect(alert).toHaveTextContent(message);
    await user.click(link);
    // The field's box opens at its first control, the tick above the domains.
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Only email addresses at these domains' }),
      ).toHaveFocus(),
    );
  });

  it('removes a way once asked, adds invites, and says when nobody can register', async () => {
    server.use(signedIn);
    const sent = settings({ ...BASE, registration: { ways: [{ signup: {} }] } });
    const user = userEvent.setup();
    const form = await openForm();

    await user.click(within(form).getByRole('button', { name: 'Remove Sign-up' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove Sign-up?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Nobody can register: the contest has no way in. Add one.',
    );
    await user.click(within(form).getByRole('button', { name: 'Add invites' }));
    expect(
      way(form, 'People you invite').getByText(
        'Save first, then invite people by username or email address here.',
      ),
    ).toBeVisible();
    await user.click(
      within(form).getByRole('button', { name: 'Save how people enter' }),
    );

    await screen.findByText('Saved.');
    expect(registrationOf(sent[0])).toEqual({ ways: [{ invite: {} }] });
  });

  it('sets when registration opens and closes, and how many may register', async () => {
    server.use(signedIn);
    const sent = settings(BASE);
    const user = userEvent.setup();
    const form = await openForm();

    const closes = within(form).getByRole('radiogroup', {
      name: 'Registration closes',
    });
    await user.click(within(closes).getByRole('radio', { name: 'At a time' }));
    // It starts at the contest's start, in the organiser's own time.
    expect(within(form).getByLabelText(/^Closes at/)).toHaveValue(
      localOf('2026-06-01T09:00:00Z'),
    );
    fireEvent.change(within(form).getByLabelText('Most entrants'), {
      target: { value: '300' },
    });
    await user.click(
      within(form).getByRole('button', { name: 'Save how people enter' }),
    );

    await screen.findByText('Saved.');
    const registration = registrationOf(sent[0]);
    expect(registration?.['capacity']).toBe(300);
    expect(Date.parse(String(registration?.['closes']))).toBe(
      Date.parse('2026-06-01T09:00:00Z'),
    );
  });

  it('warns that nobody finds a contest only its entrants see to sign up', async () => {
    server.use(signedIn);
    settings({ ...BASE, visibility: 'hidden' });
    const form = await openForm();

    expect(within(form).getByRole('note')).toHaveTextContent(
      'Only its entrants and organisers see this contest, so nobody can find it to sign up',
    );
  });

  it('opens a way’s approval from a link that names it', async () => {
    server.use(signedIn);
    settings({
      ...BASE,
      registration: {
        ways: [{ invite: {} }, { signup: { name: 'Students', approval: 'manual' } }],
      },
    });
    renderApp(`${PAGE}?field=approval&item=1`);

    const form = await screen.findByRole('group', { name: 'How people enter' });
    await waitFor(() =>
      expect(
        way(form, 'Sign-up: Students').getByRole('radio', {
          name: 'An organiser approves each one',
        }),
      ).toHaveFocus(),
    );
  });

  it('keeps the page up for a link whose item or field is no name at all', async () => {
    server.use(signedIn);
    settings({ ...BASE, registration: { ways: [{ invite: {} }] } });
    renderApp(`${PAGE}?field=a"]&item="`);

    const form = await screen.findByRole('group', { name: 'How people enter' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      within(form).getByRole('radio', { name: 'Approved straight away' }),
    ).toBeVisible();
  });

  it('opens the advanced part to focus an email pattern a link names', async () => {
    server.use(signedIn);
    settings({
      ...BASE,
      registration: {
        ways: [{ signup: { domains: ['u.nus.edu'], email_pattern: '^e' } }],
      },
    });
    renderApp(`${PAGE}?field=email_pattern&item=0`);

    const pattern = await screen.findByLabelText('Email pattern');
    await waitFor(() => expect(pattern).toHaveFocus());
    expect(pattern.closest('details')).toHaveAttribute('open');
  });

  it('shows a manager how people enter, to read', async () => {
    server.use(signedIn, ...holding('manager'));
    settings({ ...BASE, registration: { ways: [{ signup: { code: 'x' } }] } });
    const form = await openForm();

    expect(screen.getByText('Read only')).toBeVisible();
    expect(way(form, 'Sign-up').getByLabelText('Code')).toBeDisabled();
    expect(within(form).queryByRole('button', { name: 'Remove Sign-up' })).toBeNull();
    expect(
      within(form).queryByRole('button', { name: 'Save how people enter' }),
    ).toBeNull();
  });
});
