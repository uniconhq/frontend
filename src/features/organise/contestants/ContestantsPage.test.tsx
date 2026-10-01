import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { CONTEST_API, contestant } from '@/test/contestant';

const PAGE = '/orgs/acme/contests/spring/contestants';
const ROWS = `${CONTEST_API}/contestants`;

function row(name: string): HTMLElement {
  const cell = screen.getByText(name);
  const found = cell.closest('tr');
  if (found === null) throw new Error(`${name} is not in a row`);
  return found;
}

describe('the contestants page', () => {
  it('lists each registration with its status, workspace and extension', async () => {
    server.use(
      signedIn,
      http.get(ROWS, () =>
        HttpResponse.json([
          contestant(),
          contestant({
            user_id: 21,
            username: 'dee',
            name: null,
            email: null,
            status: 'approved',
            workspace: 'preparing',
            workspace_error: 'the forge or the CI did not answer',
            time_extension_seconds: 1800,
          }),
          contestant({
            user_id: 22,
            username: null,
            status: 'rejected',
            reason: 'No.',
          }),
        ]),
      ),
    );
    renderApp(PAGE);

    await screen.findByRole('table', { name: 'Registrations' });
    expect(row('carol')).toHaveTextContent('Pending');
    expect(row('carol')).toHaveTextContent('carol@example.org');
    expect(row('dee')).toHaveTextContent('Preparing');
    expect(row('dee')).toHaveTextContent('the forge or the CI did not answer');
    expect(row('dee')).toHaveTextContent('30 min');
    expect(row('Deleted user')).toHaveTextContent('No.');
  });

  it('approves a pending registration and shows the row as it comes back', async () => {
    server.use(
      signedIn,
      http.get(ROWS, () => HttpResponse.json([contestant()])),
      http.post(`${ROWS}/:user/approve`, () =>
        HttpResponse.json(contestant({ status: 'approved', workspace: 'preparing' })),
      ),
    );
    renderApp(PAGE);

    await userEvent.click(await screen.findByRole('button', { name: 'Approve carol' }));

    expect(await within(row('carol')).findByText('Approved')).toBeVisible();
    expect(row('carol')).toHaveTextContent('Preparing');
    expect(
      within(row('carol')).queryByRole('button', { name: 'Approve carol' }),
    ).toBeNull();
  });

  it('rejects with the reason typed', async () => {
    let sent: unknown = null;
    server.use(
      signedIn,
      http.get(ROWS, () => HttpResponse.json([contestant()])),
      http.post(`${ROWS}/:user/reject`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          contestant({ status: 'rejected', reason: 'Not a student.' }),
        );
      }),
    );
    renderApp(PAGE);

    await userEvent.click(await screen.findByRole('button', { name: 'Reject carol' }));
    const form = screen.getByRole('form', { name: 'Reject carol' });
    await userEvent.type(within(form).getByLabelText(/Reason/), 'Not a student.');
    await userEvent.click(within(form).getByRole('button', { name: 'Reject' }));

    expect(await within(row('carol')).findByText('Rejected')).toBeVisible();
    expect(sent).toEqual({ reason: 'Not a student.' });
  });

  it('undoes a rejection, leaving the registration pending to decide again', async () => {
    let reopened = false;
    server.use(
      signedIn,
      http.get(ROWS, () =>
        HttpResponse.json([
          contestant({ status: 'rejected', reason: 'Not a student.' }),
        ]),
      ),
      http.post(`${ROWS}/:user/reopen`, () => {
        reopened = true;
        return HttpResponse.json(contestant());
      }),
    );
    renderApp(PAGE);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Undo rejection of carol' }),
    );

    expect(await within(row('carol')).findByText('Pending')).toBeVisible();
    expect(reopened).toBe(true);
    expect(row('carol')).not.toHaveTextContent('Not a student.');
    expect(
      within(row('carol')).getByRole('button', { name: 'Approve carol' }),
    ).toBeVisible();
    expect(
      within(row('carol')).queryByRole('button', { name: 'Undo rejection of carol' }),
    ).toBeNull();
  });

  it('removes an approved contestant once it is confirmed', async () => {
    server.use(
      signedIn,
      http.get(ROWS, () =>
        HttpResponse.json([contestant({ status: 'approved', workspace: 'ready' })]),
      ),
      http.post(`${ROWS}/:user/remove`, () =>
        HttpResponse.json(contestant({ status: 'removed' })),
      ),
    );
    renderApp(PAGE);

    await userEvent.click(await screen.findByRole('button', { name: 'Remove carol' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove this contestant?',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(await within(row('carol')).findByText('Removed')).toBeVisible();
  });

  it('gives extra time in minutes, sent as seconds', async () => {
    let sent: unknown = null;
    server.use(
      signedIn,
      http.get(ROWS, () => HttpResponse.json([contestant({ status: 'approved' })])),
      http.put(`${ROWS}/:user/extension`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          contestant({ status: 'approved', time_extension_seconds: 2700 }),
        );
      }),
    );
    renderApp(PAGE);

    await userEvent.click(await screen.findByRole('button', { name: 'Extend carol' }));
    const form = screen.getByRole('form', { name: 'Extend carol' });
    const minutes = within(form).getByLabelText(/Extra minutes/);
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '45');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));

    expect(await within(row('carol')).findByText('45 min')).toBeVisible();
    expect(sent).toEqual({ seconds: 2700 });
  });

  it('starts the extension from the one the person has now, read at the click', async () => {
    server.use(
      signedIn,
      http.get(ROWS, () =>
        HttpResponse.json([
          contestant({ status: 'approved', time_extension_seconds: 1800 }),
        ]),
      ),
    );
    renderApp(PAGE);

    await userEvent.click(await screen.findByRole('button', { name: 'Extend carol' }));

    const field = screen.getByLabelText(/Extra minutes/);
    expect(field).toHaveValue('30');
    expect(field).toHaveFocus();
  });

  it('says so when the minutes are not a whole number, and sends nothing', async () => {
    let sent = false;
    server.use(
      signedIn,
      http.get(ROWS, () => HttpResponse.json([contestant({ status: 'approved' })])),
      http.put(`${ROWS}/:user/extension`, () => {
        sent = true;
        return HttpResponse.json(contestant());
      }),
    );
    renderApp(PAGE);

    await userEvent.click(await screen.findByRole('button', { name: 'Extend carol' }));
    const minutes = screen.getByLabelText(/Extra minutes/);
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '1.5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'whole number of minutes',
    );
    expect(sent).toBe(false);
  });

  it('shows a refused removal inside its dialog', async () => {
    server.use(
      signedIn,
      http.get(ROWS, () =>
        HttpResponse.json([contestant({ status: 'approved', workspace: 'ready' })]),
      ),
      http.post(`${ROWS}/:user/remove`, () => problem(503, 'forge_unavailable')),
    );
    renderApp(PAGE);

    await userEvent.click(await screen.findByRole('button', { name: 'Remove carol' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove this contestant?',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Forgejo did not answer',
    );
  });

  it('reads the table again when a registration moved on under the organiser', async () => {
    let reads = 0;
    server.use(
      signedIn,
      http.get(ROWS, () => {
        reads += 1;
        return HttpResponse.json([
          contestant(
            reads === 1 ? {} : { status: 'rejected', reason: 'By someone else.' },
          ),
        ]);
      }),
      http.post(`${ROWS}/:user/approve`, () => problem(409, 'wrong_status')),
    );
    renderApp(PAGE);

    await userEvent.click(await screen.findByRole('button', { name: 'Approve carol' }));

    expect(await within(row('carol')).findByText('Rejected')).toBeVisible();
  });

  it('shows a refusal on the row it was for', async () => {
    server.use(
      signedIn,
      http.get(ROWS, () => HttpResponse.json([contestant()])),
      http.post(`${ROWS}/:user/approve`, () =>
        problem(409, 'wrong_status', {
          detail: 'A registration that is rejected cannot be approved.',
        }),
      ),
    );
    renderApp(PAGE);

    await userEvent.click(await screen.findByRole('button', { name: 'Approve carol' }));

    expect(await within(row('carol')).findByRole('alert')).toHaveTextContent(
      'A registration that is rejected cannot be approved.',
    );
  });

  it('shows an observer the table without the actions', async () => {
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            {
              scope: { kind: 'contest', org: 'acme', contest: 'spring', task: null },
              role: 'observer',
            },
          ],
        }),
      ),
      http.get(ROWS, () => HttpResponse.json([contestant()])),
    );
    renderApp(PAGE);

    await screen.findByRole('table', { name: 'Registrations' });
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve carol' })).toBeNull();
  });

  it('says so when nobody has registered', async () => {
    server.use(
      signedIn,
      http.get(ROWS, () => HttpResponse.json([])),
    );
    renderApp(PAGE);

    expect(await screen.findByText('Nobody has registered yet.')).toBeVisible();
  });
});
