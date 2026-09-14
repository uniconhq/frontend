import { MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ReactElement, ReactNode } from 'react';
import { theme } from '@/theme/theme';
import { cssVariablesResolver } from '@/theme/css-variables';
import { routes } from '@/router';
import { createQueryClient } from '@/api/query-client';
import { reportUnauthenticated } from '@/session';

/**
 * Components read colours and fonts from the provider, so a bare render() would
 * test a different component than the one that ships.
 */
export function renderWithProviders(ui: ReactElement): RenderResult {
  const queryClient = createQueryClient({ onUnauthenticated: reportUnauthenticated });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <MantineProvider
        theme={theme}
        env="test"
        defaultColorScheme="dark"
        cssVariablesResolver={cssVariablesResolver}
      >
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </MantineProvider>
    );
  }

  return render(ui, { wrapper: Providers });
}

/**
 * The whole app at one address, with the real route table, the real shell and
 * the real session boot. Anything about guards or redirects is only true when
 * all three are in play.
 */
export function renderApp(path: string): RenderResult & {
  router: ReturnType<typeof createMemoryRouter>;
} {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { ...renderWithProviders(<RouterProvider router={router} />), router };
}
