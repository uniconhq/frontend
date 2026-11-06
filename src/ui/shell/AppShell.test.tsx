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
  it('renders the lockup, the breadcrumb and the page, with no sidebar', async () => {
    renderShell(<p>page content</p>);

    expect(await screen.findByText('unicon')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
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
});
