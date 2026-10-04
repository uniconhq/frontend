import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
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
