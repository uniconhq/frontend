import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
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
  it('renders the lockup, the top places and the page', async () => {
    renderShell(<p>page content</p>);

    expect(await screen.findByText('unicon')).toBeInTheDocument();
    const sections = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(sections).getByRole('group', { name: 'Unicon' })).toBeInTheDocument();
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

  it('lists only places that exist, every one a link', async () => {
    renderShell(null);

    const sections = await screen.findByRole('navigation', { name: 'Sections' });
    expect(
      await within(sections).findByRole('link', { name: 'Browse contests' }),
    ).toHaveAttribute('href', '/');
    for (const placeholder of ['Tasks', 'Contest setup', 'Task authoring', 'Runners']) {
      expect(within(sections).queryByText(placeholder)).not.toBeInTheDocument();
    }
    const items = within(sections)
      .getAllByRole('group')
      .flatMap((group) => [...group.children].slice(1));
    expect(items.every((item) => item.tagName === 'A')).toBe(true);
  });
});
