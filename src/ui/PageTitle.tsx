import { Title } from '@mantine/core';
import type { ReactNode } from 'react';

/** The one h1 on a page: 34px/800, -0.03em, from the type scale. */
export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <Title order={1} style={{ letterSpacing: '-0.03em' }}>
      {children}
    </Title>
  );
}
