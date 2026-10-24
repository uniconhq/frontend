import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';

const PAGE = '/orgs/acme/contests/spring/boards';

describe("a contest's leaderboards for its organisers", () => {
  it('says the page is being rebuilt', async () => {
    server.use(signedIn);
    renderApp(PAGE);
    expect(await screen.findByText('This page is being rebuilt.')).toBeVisible();
  });
});
