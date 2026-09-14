import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import {
  createMemoryRouter,
  RouterProvider,
  type NonIndexRouteObject,
  type RouteObject,
} from 'react-router';
import { renderApp, renderWithProviders } from '@/test/render';
import { routes } from './router';

describe('routes', () => {
  it('renders the 404 page inside the shell for an unknown address', async () => {
    renderApp('/no-such-page');

    expect(await screen.findByText('404')).toBeInTheDocument();
    expect(screen.getByText('unicon')).toBeInTheDocument();
  });

  it('puts the landing page behind no guard at all', async () => {
    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Unicon', level: 1 }),
    ).toBeInTheDocument();

    const signIn = await screen.findAllByRole('link', { name: 'Sign in' });
    expect(signIn).toHaveLength(2);
    for (const link of signIn) {
      expect(link).toHaveAttribute('href', '/api/v1/auth/login?next=%2F');
    }
  });

  it('renders a page that throws as an error block inside the shell', async () => {
    function Boom(): never {
      throw new Error('the page fell over');
    }

    const root = routes[0] as NonIndexRouteObject;
    const shell = root.children?.[0] as NonIndexRouteObject;
    const withBoom: RouteObject[] = [
      {
        ...root,
        children: [
          {
            ...shell,
            children: [...(shell.children ?? []), { path: 'boom', element: <Boom /> }],
          },
        ],
      },
    ];

    const router = createMemoryRouter(withBoom, { initialEntries: ['/boom'] });
    renderWithProviders(<RouterProvider router={router} />);

    expect(await screen.findByText('the page fell over')).toBeInTheDocument();
    expect(screen.getByText('unicon')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeInTheDocument();
  });
});
