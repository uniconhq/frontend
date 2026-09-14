import { Paper } from '@mantine/core';
import type { ReactNode } from 'react';

/** A panel: body surface, 1px border, 8px radius, 16px padding. No shadow. */
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
