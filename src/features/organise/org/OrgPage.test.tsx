import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import {
  ORG_API,
  contestList,
  contests,
  provisioning,
  provisioningInTurn,
} from '@/test/organiser';
import { fakeTimerUser, passTime, withFakeTimers } from '@/test/timers';

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

    await screen.findByRole('heading', { name: 'acme', level: 1 });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
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
  withFakeTimers();

  it('sends the name and title, follows it to ready and lists it', async () => {
    let made = false;
    let sent: unknown = null;
    server.use(
      signedIn,
      http.get(`${ORG_API}/contests`, () =>
        HttpResponse.json(made ? [...contests, { name: 'summer' }] : contests),
      ),
      http.post('/api/v1/orgs/acme/contests', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          provisioning({ kind: 'contest', target: 'acme/summer' }),
          { status: 202 },
        );
      }),
      provisioningInTurn('/api/v1/orgs/acme/contests/summer/provisioning', [
        provisioning({ kind: 'contest', status: 'running', attempts: 1 }),
        provisioning({
          kind: 'contest',
          status: 'ready',
          last_step: 'roles',
          attempts: 1,
        }),
      ]),
    );
    const user = fakeTimerUser();
    renderApp('/orgs/acme');

    await user.click(await screen.findByRole('button', { name: 'New contest' }));
    const form = screen.getByRole('form', { name: 'New contest' });
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), 'summer');
    await user.type(
      within(form).getByRole('textbox', { name: /^Title/ }),
      'Summer Cup',
    );
    await user.click(within(form).getByRole('button', { name: 'Create contest' }));

    const progress = await screen.findByRole('region', {
      name: 'Making the contest summer',
    });
    expect(sent).toEqual({ name: 'summer', title: 'Summer Cup' });
    expect(within(progress).getByText('Waiting to start.')).toBeVisible();
    expect(form).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'New contest' }),
    ).not.toBeInTheDocument();

    await passTime(1_000);
    const repo = await within(progress).findByText(
      'the contest repo with its starter settings',
    );
    await expect
      .poll(() => repo.closest('li')?.getAttribute('data-state'))
      .toBe('working');

    made = true;
    await passTime(1_000);
    expect(
      await within(progress).findByRole('link', { name: 'Open the contest summer' }),
    ).toHaveAttribute('href', '/orgs/acme/contests/summer');
    const list = screen.getByRole('list', { name: 'Contests' });
    expect(await within(list).findByRole('link', { name: 'summer' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'New contest' })).toBeVisible();
  });

  it('sends no title when none was given, and names the step a failure stopped at', async () => {
    let sent: unknown = null;
    server.use(
      signedIn,
      contestList,
      http.post('/api/v1/orgs/acme/contests', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(provisioning({ kind: 'contest' }), { status: 202 });
      }),
      http.get('/api/v1/orgs/acme/contests/summer/provisioning', () =>
        HttpResponse.json(
          provisioning({
            kind: 'contest',
            status: 'failed',
            last_step: 'repo',
            attempts: 1,
            failed_step: 'roles',
            error: 'the forge or the CI did not answer',
            retry_at: '2026-09-29T10:00:08Z',
          }),
        ),
      ),
    );
    const user = fakeTimerUser();
    renderApp('/orgs/acme');

    await user.click(await screen.findByRole('button', { name: 'New contest' }));
    const form = screen.getByRole('form', { name: 'New contest' });
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), 'summer');
    await user.click(within(form).getByRole('button', { name: 'Create contest' }));
    await passTime(1_000);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "It stopped at the contest repo's teams and protection. The forge or the CI did not answer.",
    );
    expect(sent).toEqual({ name: 'summer', title: null });
  });

  it('shows a refusal beside the form', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            {
              scope: { kind: 'org', org: 'acme', contest: null, task: null },
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
    const user = fakeTimerUser();
    renderApp('/orgs/acme');

    await user.click(await screen.findByRole('button', { name: 'New contest' }));
    const form = screen.getByRole('form', { name: 'New contest' });
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), 'summer');
    await user.click(within(form).getByRole('button', { name: 'Create contest' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'You need the manager role at acme.',
    );
  });
});
