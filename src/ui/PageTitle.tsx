import { Title } from '@mantine/core';
import type { ReactNode } from 'react';

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <Title order={1} style={{ letterSpacing: '-0.03em' }}>
      {children}
    </Title>
  );
}
