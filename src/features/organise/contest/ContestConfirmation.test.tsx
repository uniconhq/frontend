import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { WriteFile } from '@/api/types';
import { renderApp } from '@/test/render';
import { problem, server, signedIn } from '@/test/server';
import { CONTEST_API, files, repoFiles, standingList } from '@/test/organiser';
import userEvent from '@/test/user-event';
import { specCatalogue } from '../formula/catalogue';

const CONTEST = '/orgs/acme/contests/spring';

/** The exact request is held until the question is answered. */
function asks() {
  const sent: WriteFile[] = [];
  server.use(
    signedIn,
    standingList,
    ...repoFiles,
    http.get('/api/v1/blocks', () => HttpResponse.json(specCatalogue())),
    http.put(`${CONTEST_API}/files/:path`, async ({ request }) => {
      const body = (await request.json()) as WriteFile;
      sent.push(body);
      return body.confirm
        ? HttpResponse.json({ version: 'v2', notes: [] })
        : problem(409, 'confirmation_required', {
            detail: 'The contest is running. Save it?',
            changes: ["The Standings leaderboard's columns change."],
            asked: 'contest-v1',
          });
    }),
  );
  return sent;
}

async function confirm(sent: WriteFile[]) {
  const save = await screen.findByRole('button', { name: 'Save the change' });
  expect(screen.queryByRole('button', { name: 'Keep as draft' })).toBeNull();
  expect(sent).toHaveLength(1);
  await userEvent.click(save);
  await waitFor(() => expect(sent).toHaveLength(2));
  expect(sent[1]).toEqual({ ...sent[0], confirm: true, asked: 'contest-v1' });
}

describe('contest writers answer the save question', () => {
  it('confirms the settings form', async () => {
    const sent = asks();
    renderApp(`${CONTEST}/settings`);
    const form = await screen.findByRole('form', { name: 'Contest settings' });
    await userEvent.type(
      within(form).getByRole('textbox', { name: 'Description' }),
      'Ours',
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Save settings' }));
    await confirm(sent);
    expect(await screen.findByText('Saved.')).toBeVisible();
  });

  it('confirms the entry form', async () => {
    const sent = asks();
    renderApp(`${CONTEST}/entry`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Students at a domain' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Email domains' }),
      'u.nus.edu',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save how people enter' }),
    );
    await confirm(sent);
  });

  it('confirms the task timeline form', async () => {
    const sent = asks();
    renderApp(CONTEST);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change A · sort in this contest' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'A · sort in this contest',
    });
    const due = await within(dialog).findByRole('radiogroup', { name: 'Due' });
    await userEvent.click(within(due).getByRole('radio', { name: 'At a time' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await confirm(sent);
  });

  it('confirms the leaderboard form', async () => {
    const sent = asks();
    renderApp(`${CONTEST}/leaderboards`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a leaderboard' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await confirm(sent);
  });

  it('confirms a task order change', async () => {
    const sent = asks();
    renderApp(CONTEST);
    const row = await screen.findByRole('listitem', { name: 'A · sort' });
    await userEvent.click(
      within(row).getByRole('button', { name: 'Move A · sort down' }),
    );
    await confirm(sent);
  });

  it('confirms a status card change', async () => {
    const sent = asks();
    renderApp(CONTEST);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change who sees it' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Who sees it' });
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Anyone, signed in or not' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await confirm(sent);
  });

  it('confirms the stored contest settings without offering a draft', async () => {
    const sent = asks();
    server.use(
      http.get(`${CONTEST_API}/files/:path`, () =>
        HttpResponse.json({
          ...files['contest.yaml'],
          content: 'name: Spring\nstart: [\n',
        }),
      ),
    );
    renderApp(`${CONTEST}/settings`);
    const text = await screen.findByRole('textbox', { name: 'contest.yaml' });
    await userEvent.type(text, 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await confirm(sent);
  });
});
