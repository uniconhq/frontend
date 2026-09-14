import { MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import '@mantine/core/styles.css';
import './theme/fonts';
import './global.css';
import { theme } from './theme/theme';
import { cssVariablesResolver } from './theme/css-variables';
import { createQueryClient } from './api/query-client';
import { reportUnauthenticated } from './session';
import { router } from './router';

const queryClient = createQueryClient({ onUnauthenticated: reportUnauthenticated });

export function App() {
  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="auto"
      cssVariablesResolver={cssVariablesResolver}
    >
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>
  );
}
