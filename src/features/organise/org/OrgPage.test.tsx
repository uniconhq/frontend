import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { ORG_API, contestList, contests, listAndCreate } from '@/test/organiser';

describe('the org page', () => {
  it('lists the contests, each linking to its page', async () => {
    server.use(signedIn, contestList);
    renderApp('/orgs/acme');

    const list = await screen.findByRole('list', { name: 'Contests' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/orgs/acme/contests/autumn',
      '/orgs/acme/contests/spring',
    ]);
    expect(screen.getByRole('heading', { name: 'acme', level: 1 })).toBeVisible();
  });

  it('shows a skeleton while the contests load', async () => {
    server.use(
      signedIn,
      http.get(`${ORG_API}/contests`, async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    renderApp('/orgs/acme');

    const heading = await screen.findByRole('heading', { name: 'Contests' });
    expect(
      within(heading.parentElement as HTMLElement).getByRole('status', {
        name: 'Loading',
      }),
    ).toBeInTheDocument();
  });

  it('says there are none yet rather than showing an empty box', async () => {
    server.use(
      signedIn,
      http.get(`${ORG_API}/contests`, () => HttpResponse.json([])),
    );
    renderApp('/orgs/acme');

    expect(await screen.findByText('No contests yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'New contest' })).toBeVisible();
    expect(screen.queryByRole('form', { name: 'New contest' })).not.toBeInTheDocument();
  });

  it('opens the form from its button and closes it again on Cancel', async () => {
    server.use(signedIn, contestList);
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    await user.click(await screen.findByRole('button', { name: 'New contest' }));
    const form = screen.getByRole('form', { name: 'New contest' });
    expect(within(form).getByRole('textbox', { name: /^Name/ })).toHaveFocus();
    expect(within(form).getByRole('button', { name: 'Create contest' })).toBeDisabled();

    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(form).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New contest' })).toHaveFocus();
  });

  it('shows the refusal to someone who is not an observer, with the contests they can reach', async () => {
    server.use(
      signedIn,
      http.get(`${ORG_API}/contests`, () =>
        problem(403, 'forbidden', { detail: 'You need the observer role at acme.' }),
      ),
    );
    renderApp('/orgs/acme');

    expect(await screen.findByText('You cannot do that')).toBeVisible();
    expect(screen.getByText('You need the observer role at acme.')).toBeVisible();
    const own = screen.getByRole('list', { name: 'Your contests' });
    expect(within(own).getByRole('link', { name: 'spring' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/spring',
    );
    expect(screen.queryByRole('form', { name: 'New contest' })).not.toBeInTheDocument();
  });

  it('offers to try again when the list failed for another reason', async () => {
    let broken = true;
    server.use(
      signedIn,
      http.get(`${ORG_API}/contests`, () =>
        broken ? problem(503, 'forge_unavailable') : HttpResponse.json(contests),
      ),
    );
    renderApp('/orgs/acme');

    await screen.findByText('Forgejo did not answer', {}, { timeout: 3_000 });
    broken = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('list', { name: 'Contests' })).toBeVisible();
  });
});

describe("the org's display name and description", () => {
  /** The org as the forge holds it, changed by each PATCH; `sent` holds each body. */
  function profileAt(answer?: () => Response) {
    let profile: { display_name: string | null; description: string } = {
      display_name: 'Acme Contests',
      description: 'Contests for Acme engineers.',
    };
    const sent: unknown[] = [];
    server.use(
      http.get(ORG_API, () => HttpResponse.json(profile)),
      http.patch(ORG_API, async ({ request }) => {
        const refused = answer?.();
        if (refused !== undefined) return refused;
        const body = (await request.json()) as typeof profile;
        sent.push(body);
        profile = {
          display_name: body.display_name === '' ? null : body.display_name,
          description: body.description,
        };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    return sent;
  }

  function asRole(role: 'manager' | 'observer') {
    return http.get('/api/v1/me', () =>
      HttpResponse.json({
        ...someone,
        roles: [{ names: { org: 'acme', contest: null, task: null }, role }],
      }),
    );
  }

  it('shows them as the forge holds them', async () => {
    server.use(signedIn, contestList);
    profileAt();
    renderApp('/orgs/acme');

    const fields = await screen.findByLabelText('About the org');
    expect(fields).toHaveTextContent('Display nameAcme Contests');
    expect(fields).toHaveTextContent('DescriptionContests for Acme engineers.');
  });

  it('lets an admin change both in place, and shows what the forge then holds', async () => {
    server.use(signedIn, contestList);
    const sent = profileAt();
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('form', { name: 'Edit the org' });
    const name = within(form).getByRole('textbox', { name: /^Display name/ });
    expect(name).toHaveFocus();
    expect(name).toHaveValue('Acme Contests');
    const description = within(form).getByRole('textbox', { name: /^Description/ });
    expect(description).toHaveAttribute('maxlength', '255');
    await user.clear(name);
    await user.type(name, '  Acme Cup ');
    await user.clear(description);
    await user.type(description, 'The yearly Acme cup.');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(form).not.toBeInTheDocument());
    expect(sent).toEqual([
      { display_name: 'Acme Cup', description: 'The yearly Acme cup.' },
    ]);
    const fields = screen.getByLabelText('About the org');
    await waitFor(() => expect(fields).toHaveTextContent('Display nameAcme Cup'));
    expect(fields).toHaveTextContent('DescriptionThe yearly Acme cup.');
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
  });

  it('sends an emptied display name, which leaves the org showing its name', async () => {
    server.use(signedIn, contestList);
    const sent = profileAt();
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByRole('textbox', { name: /^Display name/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('None; the name shows.')).toBeVisible();
    expect(sent).toEqual([
      { display_name: '', description: 'Contests for Acme engineers.' },
    ]);
  });

  it('keeps the form with what was typed when the change is refused', async () => {
    server.use(signedIn, contestList);
    profileAt(() =>
      problem(403, 'forbidden', { detail: 'This needs the admin role at acme.' }),
    );
    const user = userEvent.setup();
    renderApp('/orgs/acme');

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('form', { name: 'Edit the org' });
    await user.type(within(form).getByRole('textbox', { name: /^Description/ }), '!');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'This needs the admin role at acme.',
    );
    expect(within(form).getByRole('textbox', { name: /^Description/ })).toHaveValue(
      'Contests for Acme engineers.!',
    );

    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(form).not.toBeInTheDocument();
    expect(screen.getByLabelText('About the org')).toHaveTextContent(
      'Contests for Acme engineers.',
    );
  });

  it.each(['manager', 'observer'] as const)(
    'shows a %s both with no way to edit them',
    async (role) => {
      server.use(asRole(role), contestList);
      profileAt();
      renderApp('/orgs/acme');

      expect(await screen.findByLabelText('About the org')).toHaveTextContent(
        'Acme Contests',
      );
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(screen.getByText('Only an admin of the org changes these.')).toBeVisible();
    },
  );
});

describe('creating a contest', () => {
  async function submitContest(name: string, title = '') {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New contest' }));
    const form = screen.getByRole('form', { name: 'New contest' });
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), name);
    if (title !== '') {
      await user.type(within(form).getByRole('textbox', { name: /^Title/ }), title);
    }
    await user.click(within(form).getByRole('button', { name: 'Create contest' }));
    return form;
  }

  it('sends the name and title, closes the form and lists the new contest', async () => {
    const { handlers, sent } = listAndCreate('/api/v1/orgs/acme/contests', contests);
    server.use(signedIn, ...handlers);
    renderApp('/orgs/acme');

    const form = await submitContest('summer', 'Summer Cup');

    const list = screen.getByRole('list', { name: 'Contests' });
    expect(await within(list).findByRole('link', { name: 'summer' })).toHaveAttribute(
      'href',
      '/orgs/acme/contests/summer',
    );
    expect(sent).toEqual([{ name: 'summer', title: 'Summer Cup' }]);
    expect(form).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New contest' })).toHaveFocus();
  });

  it('sends no title when none was given', async () => {
    const { handlers, sent } = listAndCreate('/api/v1/orgs/acme/contests', contests);
    server.use(signedIn, ...handlers);
    renderApp('/orgs/acme');

    await submitContest('summer');

    expect(await screen.findByRole('button', { name: 'New contest' })).toBeVisible();
    expect(sent).toEqual([{ name: 'summer', title: null }]);
  });

  it('shows a refusal beside the form, keeping what was typed', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            {
              names: { org: 'acme', contest: null, task: null },
              role: 'observer',
            },
          ],
        }),
      ),
      contestList,
      http.post('/api/v1/orgs/acme/contests', () =>
        problem(403, 'forbidden', { detail: 'You need the manager role at acme.' }),
      ),
    );
    renderApp('/orgs/acme');

    const form = await submitContest('summer');

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'You need the manager role at acme.',
    );
    expect(within(form).getByRole('textbox', { name: /^Name/ })).toHaveValue('summer');
  });
});
