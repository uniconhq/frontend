import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test/render';
import { FORGE, server, sessionList, signedIn } from '@/test/server';

describe('the account menu', () => {
  it("leads to the person's settings at Forgejo, the one page of theirs it serves", async () => {
    server.use(signedIn, sessionList);
    const user = userEvent.setup();
    renderApp('/account');

    await user.click(await screen.findByRole('button', { name: 'Account menu' }));

    expect(await screen.findByRole('menuitem', { name: 'Forgejo' })).toHaveAttribute(
      'href',
      `${FORGE}/user/settings`,
    );
  });
});
