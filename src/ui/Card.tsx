import { Paper } from '@mantine/core';
import type { ReactNode } from 'react';

export function Card({ children }: { children: ReactNode }) {
  return (
    <Paper
      radius="md"
      p="md"
      bg="var(--unicon-body)"
      style={{ border: '1px solid var(--unicon-border)' }}
    >
      {children}
    </Paper>
  );
}
