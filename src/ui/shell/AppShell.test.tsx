import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { SessionProvider } from '@/session';
import { AppShell } from './AppShell';

function renderShell(page: React.ReactNode) {
  return renderWithProviders(
    <MemoryRouter>
      <SessionProvider>
        <AppShell>{page}</AppShell>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  it('renders the lockup, the three sidebar groups and the page', async () => {
    renderShell(<p>page content</p>);

    expect(await screen.findByText('unicon')).toBeInTheDocument();
    for (const group of ['Contest', 'Admin', 'Discover']) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('starts the tab order with a way past the navigation', async () => {
    renderShell(<p>page content</p>);

    const skip = await screen.findByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#main');
    expect(document.getElementById('main')).toContainElement(
      screen.getByText('page content'),
    );
  });

  it('offers only Browse contests as a link until the other pages exist', async () => {
    renderShell(null);

    expect(
      await screen.findByRole('link', { name: 'Browse contests' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tasks' })).not.toBeInTheDocument();
  });
});
