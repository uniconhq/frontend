import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { formatTimeOfDay } from '@/lib/time';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { provisioning, provisioningInTurn } from '@/test/organiser';
import { fakeTimerUser, passTime, withFakeTimers } from '@/test/timers';

async function createOrg(name: string, description = '') {
  const user = fakeTimerUser();
  renderApp('/orgs/new');
  await user.type(await screen.findByRole('textbox', { name: /^Name/ }), name);
  if (description !== '') {
    await user.type(screen.getByRole('textbox', { name: /^Description/ }), description);
  }
  await user.click(screen.getByRole('button', { name: 'Create org' }));
  return user;
}

describe('creating an org', () => {
  withFakeTimers();

  it('sends the name and description, then follows it through to ready', async () => {
    let sent: unknown = null;
    server.use(
      signedIn,
      http.post('/api/v1/orgs', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(provisioning(), { status: 202 });
      }),
      provisioningInTurn('/api/v1/orgs/acme/provisioning', [
        provisioning({ status: 'running', last_step: 'labels', attempts: 1 }),
        provisioning({ status: 'ready', last_step: 'ci_login', attempts: 1 }),
      ]),
    );

    await createOrg('acme', 'Acme contests');

    const progress = await screen.findByRole('region', { name: 'Making the org acme' });
    expect(within(progress).getByRole('status')).toHaveTextContent('Waiting to start.');
    expect(sent).toEqual({ name: 'acme', description: 'Acme contests' });

    await passTime(1_000);
    expect(await within(progress).findByText(/Working on it/)).toBeVisible();
    expect(within(progress).getByRole('status')).toHaveTextContent(
      'Working on it. Attempt 1.',
    );
    expect(
      within(progress).getByText("Reached: the org's discussion labels."),
    ).toBeInTheDocument();
    const working = within(progress).getByText(
      'the event push from the forge to Unicon',
    );
    expect(working.closest('li')).toHaveAttribute('data-state', 'working');
    expect(
      within(progress).getByText('the organization at the forge').closest('li'),
    ).toHaveAttribute('data-state', 'done');

    await passTime(1_000);
    const open = await within(progress).findByRole('link', {
      name: 'Open the org acme',
    });
    expect(open).toHaveAttribute('href', '/orgs/acme');
    expect(within(progress).getByText(/Ready\./)).toBeInTheDocument();
  });

  it('fetches the roles again once ready, so the new org is in the list', async () => {
    let admin = false;
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json(
          admin
            ? {
                ...someone,
                roles: [
                  ...someone.roles,
                  {
                    scope: { kind: 'org', org: 'beta', contest: null, task: null },
                    role: 'admin',
                  },
                ],
              }
            : someone,
        ),
      ),
      http.post('/api/v1/orgs', () =>
        HttpResponse.json(provisioning({ target: 'beta' }), { status: 202 }),
      ),
      http.get('/api/v1/orgs/beta/provisioning', () => {
        admin = true;
        return HttpResponse.json(
          provisioning({ target: 'beta', status: 'ready', last_step: 'ci_login' }),
        );
      }),
    );

    const user = await createOrg('beta');
    await passTime(1_000);
    await user.click(await screen.findByRole('link', { name: 'Open the org beta' }));
    await user.click(screen.getByRole('link', { name: 'orgs' }));

    const list = await screen.findByRole('list', { name: 'Your orgs' });
    expect(within(list).getByRole('link', { name: 'beta' })).toBeInTheDocument();
  });

  it('shows the step a failure stopped at, the reason and when it is tried again, and keeps following it', async () => {
    const retryAt = '2099-01-01T10:00:08Z';
    server.use(
      signedIn,
      http.post('/api/v1/orgs', () =>
        HttpResponse.json(provisioning(), { status: 202 }),
      ),
      provisioningInTurn('/api/v1/orgs/acme/provisioning', [
        provisioning({
          status: 'failed',
          last_step: 'first_admin',
          failed_step: 'service_account',
          attempts: 2,
          error: 'the forge refused this step',
          retry_at: retryAt,
        }),
        provisioning({ status: 'ready', last_step: 'ci_login', attempts: 3 }),
      ]),
    );

    await createOrg('acme');
    await passTime(1_000);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "It stopped at the org's service account. The forge refused this step.",
    );
    expect(alert).toHaveTextContent(
      `It is tried again on its own at ${formatTimeOfDay(new Date(retryAt))}, without repeating the steps that finished.`,
    );
    expect(screen.getByText(/Attempt 2/)).toBeInTheDocument();
    expect(screen.getByText("the org's service account").closest('li')).toHaveAttribute(
      'data-state',
      'failed',
    );

    await passTime(1_000);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await passTime(4_000);
    expect(
      await screen.findByRole('link', { name: 'Open the org acme' }),
    ).toHaveAttribute('href', '/orgs/acme');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says a failed row whose time has come is being tried again, and names a failure outside its steps', async () => {
    server.use(
      signedIn,
      http.post('/api/v1/orgs', () =>
        HttpResponse.json(
          provisioning({
            status: 'failed',
            attempts: 1,
            error: 'the step failed unexpectedly',
            retry_at: '2000-01-01T00:00:00Z',
          }),
          { status: 202 },
        ),
      ),
      http.get('/api/v1/orgs/acme/provisioning', () =>
        HttpResponse.json(
          provisioning({
            status: 'failed',
            attempts: 1,
            error: 'the step failed unexpectedly',
            retry_at: '2000-01-01T00:00:00Z',
          }),
        ),
      ),
    );

    await createOrg('acme');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'It stopped outside its steps. The step failed unexpectedly.',
    );
    expect(alert).toHaveTextContent(
      'It is being tried again now, without repeating the steps that finished.',
    );
    for (const item of screen.getAllByRole('listitem')) {
      expect(item).not.toHaveAttribute('data-state', 'failed');
    }
  });

  it('shows the steps the record names, in its order, a step it does not know under its id', async () => {
    server.use(
      signedIn,
      http.post('/api/v1/orgs', () =>
        HttpResponse.json(provisioning({ steps: ['org', 'new_step', 'ci_login'] }), {
          status: 202,
        }),
      ),
      http.get('/api/v1/orgs/acme/provisioning', () =>
        HttpResponse.json(
          provisioning({
            status: 'running',
            steps: ['org', 'new_step', 'ci_login'],
            last_step: 'org',
            attempts: 1,
          }),
        ),
      ),
    );

    await createOrg('acme');

    const progress = await screen.findByRole('region', { name: 'Making the org acme' });
    await passTime(1_000);
    expect(await within(progress).findByText(/Working on it/)).toBeVisible();
    expect(within(progress).getByText('new_step').closest('li')).toHaveAttribute(
      'data-state',
      'working',
    );
    expect(
      within(progress)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'donethe organization at the forge',
      'workingnew_step',
      "waitingthe service account's sign-in at the CI",
    ]);
  });

  it('holds the description to 255 characters', async () => {
    let sent: unknown = null;
    server.use(
      signedIn,
      http.post('/api/v1/orgs', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(provisioning(), { status: 202 });
      }),
    );
    const user = fakeTimerUser();
    renderApp('/orgs/new');
    await user.type(await screen.findByRole('textbox', { name: /^Name/ }), 'acme');
    const description = screen.getByRole('textbox', { name: /^Description/ });
    expect(description).toHaveAttribute('maxlength', '255');

    await user.click(description);
    await user.paste('x'.repeat(300));
    await user.click(screen.getByRole('button', { name: 'Create org' }));

    await screen.findByRole('region', { name: 'Making the org acme' });
    expect(sent).toEqual({ name: 'acme', description: 'x'.repeat(255) });
  });

  it.each([
    ['forbidden', 403, 'Org creation is closed on this instance.'],
    ['conflict', 409, 'The org acme already exists.'],
    ['invalid_name', 422, 'A name is lowercase letters, digits and dashes.'],
  ])(
    'shows a %s refusal beside the form, keeping what was typed',
    async (code, status, detail) => {
      server.use(
        signedIn,
        http.post('/api/v1/orgs', () => problem(status, code, { detail })),
      );

      await createOrg('acme');

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(detail);
      const name = screen.getByRole('textbox', { name: /^Name/ });
      expect(name).toHaveValue('acme');
      expect(name).toHaveFocus();
      expect(screen.queryByRole('region', { name: /Making/ })).not.toBeInTheDocument();
    },
  );
});
