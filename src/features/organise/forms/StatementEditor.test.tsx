import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render';
import { problem, server, signedIn, someone } from '@/test/server';
import { TASK_API, publicationList, repoFiles, taskState } from '@/test/organiser';

const STATEMENT = '# Sum\n\nWrite the sum of two numbers.\n';

function statementBackend(
  answer: () => Response,
  upload: { size: number; digest: string } | null = null,
) {
  const sent: { content: string; token: string }[] = [];
  server.use(
    signedIn,
    taskState,
    publicationList,
    http.get(`${TASK_API}/files/:path`, ({ params }) =>
      params['path'] === 'statement.md'
        ? HttpResponse.json({
            path: 'statement.md',
            encoding: 'utf-8',
            content: STATEMENT,
            token: 'token-statement',
            upload,
          })
        : undefined,
    ),
    http.put(`${TASK_API}/files/:path`, async ({ request }) => {
      sent.push((await request.json()) as { content: string; token: string });
      return answer();
    }),
    ...repoFiles,
  );
  return { sent };
}

describe('the statement beside its preview', { timeout: 20_000 }, () => {
  it('shows a statement that is an upload by its size and digest, never as text', async () => {
    statementBackend(() => HttpResponse.json({}), { size: 40, digest: 'c'.repeat(64) });
    renderApp('/orgs/acme/contests/spring/tasks/sum');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit the statement' }),
    );

    const shown = await screen.findByRole('region', { name: 'Uploaded statement.md' });
    expect(within(shown).getByText('c'.repeat(64))).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Statement source' })).toBeNull();
  });

  it('lets an admin edit the statement and shows it as contestants will', async () => {
    const { sent } = statementBackend(() =>
      HttpResponse.json({
        number: 3,
        grading_changed: false,
        changes: [],
        notes: [],
        regraded: 0,
      }),
    );
    renderApp('/orgs/acme/contests/spring/tasks/sum');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Edit the statement' }),
    );

    const source = await screen.findByRole('textbox', { name: 'Statement source' });
    const preview = screen.getByRole('region', { name: 'What contestants see' });
    expect(within(preview).getByRole('heading', { name: 'Sum' })).toBeVisible();

    fireEvent.change(source, { target: { value: '# Sum of two\n\nAdd **both**.\n' } });
    expect(within(preview).getByRole('heading', { name: 'Sum of two' })).toBeVisible();
    expect(within(preview).getByText('both').tagName).toBe('STRONG');
    await userEvent.click(screen.getByRole('button', { name: 'Save statement' }));

    expect(await screen.findByText('Published as publication 3.')).toBeVisible();
    expect(sent).toEqual([
      {
        content: '# Sum of two\n\nAdd **both**.\n',
        encoding: 'utf-8',
        token: 'token-statement',
        confirm: false,
        keep_as_draft: false,
      },
    ]);
  });

  it('shows a manager the statement read-only, with no way to save it', async () => {
    statementBackend(() => problem(403, 'admin_only', { keys: ['statement.md'] }));
    server.use(
      http.get('/api/v1/me', () =>
        HttpResponse.json({
          ...someone,
          roles: [
            { names: { org: 'acme', contest: 'spring', task: 'sum' }, role: 'manager' },
          ],
        }),
      ),
    );
    renderApp('/orgs/acme/contests/spring/tasks/sum');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Read the statement' }),
    );

    expect(
      await screen.findByRole('textbox', { name: 'Statement source' }),
    ).toHaveAttribute('readonly');
    expect(
      screen.getByText('Only an admin of the task changes the statement.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Save statement' }),
    ).not.toBeInTheDocument();
  });
});
