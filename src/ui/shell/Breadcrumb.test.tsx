import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { CONTEST_API, TASK_API, home, taskPage } from '@/test/contestant';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';

/** Each step of the trail: its words, where it goes, and whether it is the page. */
async function trail() {
  const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' });
  return [...nav.children].map((step) => {
    const link = within(step as HTMLElement).queryByRole('link');
    return {
      label: step.textContent.replace(/^\//, ''),
      to: link?.getAttribute('href') ?? null,
      current: link?.getAttribute('aria-current') === 'page',
    };
  });
}

describe('the breadcrumb', () => {
  it('walks an organiser down to a section of a task, each step a link', async () => {
    server.use(signedIn);
    renderApp('/orgs/acme/contests/spring/tasks/sum/gradings');

    expect(await trail()).toEqual([
      { label: 'Orgs', to: '/orgs', current: false },
      { label: 'acme', to: '/orgs/acme', current: false },
      { label: 'spring', to: '/orgs/acme/contests/spring', current: false },
      { label: 'sum', to: '/orgs/acme/contests/spring/tasks/sum', current: false },
      {
        label: 'Gradings',
        to: '/orgs/acme/contests/spring/tasks/sum/gradings',
        current: true,
      },
    ]);
  });

  it("names the org's open questions as their card and sidebar entry do", async () => {
    server.use(signedIn);
    renderApp('/orgs/acme/clarifications');

    expect((await trail()).map((step) => step.label)).toEqual([
      'Orgs',
      'acme',
      'Open questions',
    ]);
  });

  it('keeps a part of a section opened by its address under the section', async () => {
    server.use(signedIn);
    renderApp('/orgs/acme/contests/spring/settings#file');

    expect((await trail()).at(-1)).toEqual({
      label: 'Settings',
      to: '/orgs/acme/contests/spring/settings',
      current: true,
    });
  });

  it('says an address that is no page is not found, not that it is another page', async () => {
    server.use(signedIn);
    renderApp('/no/such/page');

    expect(await trail()).toEqual([
      { label: 'Page not found', to: null, current: false },
    ]);
  });

  it('puts a contest its contestants see under the contests, with its org', async () => {
    server.use(
      http.get('/api/v1/public/contests/:org/:contest/leaderboards', () =>
        HttpResponse.json([]),
      ),
    );
    renderApp('/contests/acme/spring/leaderboards');

    expect(await trail()).toEqual([
      { label: 'Browse contests', to: '/', current: false },
      { label: 'acme', to: null, current: false },
      { label: 'spring', to: '/contests/acme/spring', current: false },
      {
        label: 'Leaderboards',
        to: '/contests/acme/spring/leaderboards',
        current: true,
      },
    ]);
  });

  it.each([
    ['/', [{ label: 'Browse contests', to: '/', current: true }]],
    ['/account', [{ label: 'Account', to: '/account', current: true }]],
    ['/invites', [{ label: 'Invites', to: '/invites', current: true }]],
    [
      '/workflows/kenny/tuned',
      [
        { label: 'Workflows', to: '/workflows', current: false },
        { label: 'kenny/tuned', to: '/workflows/kenny/tuned', current: true },
      ],
    ],
  ])('gives %s a real trail, with no menu it does not have', async (path, steps) => {
    server.use(signedIn);
    renderApp(path);

    expect(await trail()).toEqual(steps);
    expect(screen.queryByText('▾')).toBeNull();
  });

  it('names the contest and the task as their pages do, the org in plain words', async () => {
    let askedOrg = 0;
    server.use(
      signedIn,
      http.get('/api/v1/orgs/:org', () => {
        askedOrg += 1;
        return HttpResponse.json({ display_name: 'Acme University', description: '' });
      }),
      http.get(`${CONTEST_API}/home`, () => HttpResponse.json(home())),
      http.get(`${TASK_API}/page`, () => HttpResponse.json(taskPage)),
      http.get(`${TASK_API}/submissions`, () => HttpResponse.json([])),
    );
    renderApp('/contests/acme/spring/tasks/sum');

    await screen.findByRole('heading', { name: 'A. Sum of Two', level: 1 });
    expect(await trail()).toEqual([
      { label: 'Browse contests', to: '/', current: false },
      { label: 'acme', to: null, current: false },
      { label: 'Spring 2026', to: '/contests/acme/spring', current: false },
      { label: 'A. Sum of Two', to: '/contests/acme/spring/tasks/sum', current: true },
    ]);
    // The trail asks nothing of its own: an entrant's pages never read the org.
    expect(askedOrg).toBe(0);
    const org = screen.getByText('acme', { selector: 'span' });
    expect(org).toHaveClass(/_plain_/);
    expect(org).not.toHaveClass(/_link_/);
  });

  it('calls each step by its address until its page has read its name', async () => {
    server.use(
      signedIn,
      http.get(`${CONTEST_API}/home`, async () => {
        await delay('infinite');
        return HttpResponse.json(home());
      }),
      http.get(`${TASK_API}/page`, async () => {
        await delay('infinite');
        return HttpResponse.json(taskPage);
      }),
    );
    renderApp('/contests/acme/spring/tasks/sum');

    expect((await trail()).map((step) => step.label)).toEqual([
      'Browse contests',
      'acme',
      'spring',
      'sum',
    ]);
  });

  it('names an org by its display name once its page has read it', async () => {
    server.use(
      signedIn,
      http.get('/api/v1/orgs/:org', () =>
        HttpResponse.json({ display_name: 'Acme University', description: '' }),
      ),
    );
    renderApp('/orgs/acme');

    await waitFor(async () =>
      expect((await trail()).map((step) => step.label)).toEqual([
        'Orgs',
        'Acme University',
      ]),
    );
  });
});
