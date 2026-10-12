import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { contestList } from '@/test/organiser';

/** Opens the new org's form from the orgs page's one button. */
async function openForm() {
  const user = userEvent.setup();
  renderApp('/orgs');
  await user.click(await screen.findByRole('button', { name: 'New org' }));
  return { user, form: await screen.findByRole('form', { name: 'New org' }) };
}

async function createOrg(name: string, description = '') {
  const { user } = await openForm();
  await user.type(await screen.findByRole('textbox', { name: /^Name/ }), name);
  if (description !== '') {
    await user.type(screen.getByRole('textbox', { name: /^Description/ }), description);
  }
  await user.click(screen.getByRole('button', { name: 'Create org' }));
  return user;
}

describe('creating an org', () => {
  it('sends the name and description, then opens the org’s page', async () => {
    let sent: unknown = null;
    server.use(
      signedIn,
      contestList,
      http.post('/api/v1/orgs', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ name: 'acme' }, { status: 201 });
      }),
    );

    await createOrg('acme', 'Acme contests');

    expect(
      await screen.findByRole('heading', { name: 'acme', level: 1 }),
    ).toBeVisible();
    expect(sent).toEqual({ name: 'acme', description: 'Acme contests' });
    expect(screen.queryByRole('form', { name: 'New org' })).not.toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Contests' })).toBeVisible();
  });

  it('fetches the roles again once made, so the new org is in the list', async () => {
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
                    names: { org: 'beta', contest: null, task: null },
                    role: 'admin',
                  },
                ],
              }
            : someone,
        ),
      ),
      contestList,
      http.post('/api/v1/orgs', () => {
        admin = true;
        return HttpResponse.json({ name: 'beta' }, { status: 201 });
      }),
    );

    const user = await createOrg('beta');
    await screen.findByRole('heading', { name: 'beta', level: 1 });
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    await user.click(within(trail).getByRole('link', { name: 'Orgs' }));

    const list = await screen.findByRole('list', { name: 'Your orgs' });
    expect(within(list).getByRole('link', { name: 'beta' })).toBeInTheDocument();
  });

  it('holds the description to 255 characters', async () => {
    let sent: unknown = null;
    server.use(
      signedIn,
      contestList,
      http.post('/api/v1/orgs', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ name: 'acme' }, { status: 201 });
      }),
    );
    const { user } = await openForm();
    await user.type(await screen.findByRole('textbox', { name: /^Name/ }), 'acme');
    const description = screen.getByRole('textbox', { name: /^Description/ });
    expect(description).toHaveAttribute('maxlength', '255');

    await user.click(description);
    await user.paste('x'.repeat(300));
    await user.click(screen.getByRole('button', { name: 'Create org' }));

    await screen.findByRole('heading', { name: 'acme', level: 1 });
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

      const form = screen.getByRole('form', { name: 'New org' });
      const alert = await within(form).findByRole('alert');
      expect(alert).toHaveTextContent(detail);
      const name = within(form).getByRole('textbox', { name: /^Name/ });
      expect(name).toHaveValue('acme');
      expect(name).toHaveFocus();
      expect(screen.getByRole('dialog', { name: 'New org' })).toBeVisible();
    },
  );

  it('closes the form on Cancel, back on its button, with nothing sent', async () => {
    let sent = false;
    server.use(
      signedIn,
      http.post('/api/v1/orgs', () => {
        sent = true;
        return HttpResponse.json({ name: 'acme' }, { status: 201 });
      }),
    );
    const { user, form } = await openForm();
    expect(within(form).getByRole('textbox', { name: /^Name/ })).toHaveFocus();

    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(form).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New org' })).toHaveFocus(),
    );
    expect(sent).toBe(false);
  });

  it('opens the same form at an address of its own', async () => {
    let sent: unknown = null;
    server.use(
      signedIn,
      contestList,
      http.post('/api/v1/orgs', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ name: 'acme' }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/orgs/new');

    const form = await screen.findByRole('form', { name: 'New org' });
    await user.type(within(form).getByRole('textbox', { name: /^Name/ }), 'acme');
    await user.click(within(form).getByRole('button', { name: 'Create org' }));

    expect(
      await screen.findByRole('heading', { name: 'acme', level: 1 }),
    ).toBeVisible();
    expect(sent).toEqual({ name: 'acme', description: '' });
  });
});
