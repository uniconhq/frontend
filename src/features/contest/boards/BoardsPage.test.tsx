import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from '@/test/render';
import { server, signedIn } from '@/test/server';

const PAGE = '/contests/acme/spring/boards';

describe("a contest's leaderboards", () => {
  it('says the page is being rebuilt', async () => {
    server.use(signedIn);
    renderApp(PAGE);
    expect(await screen.findByText('This page is being rebuilt.')).toBeVisible();
  });
});
