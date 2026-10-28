import { expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '@/test/render';
import userEvent from '@/test/user-event';
import { ReadOnly } from './ReadOnly';

it('links to this level’s organisers through its information', async () => {
  renderWithProviders(
    <MemoryRouter>
      <ReadOnly to="/orgs/acme/people" organisers="Org organisers" />
    </MemoryRouter>,
  );
  expect(screen.getByText('Read only')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'About Read only' }));
  expect(await screen.findByRole('link', { name: 'Org organisers' })).toHaveAttribute(
    'href',
    '/orgs/acme/people',
  );
});
