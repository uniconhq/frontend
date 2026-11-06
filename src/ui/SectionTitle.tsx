import { Title } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * One look for every heading below the page title, but a separate level, so a
 * screen reader still follows the nesting.
 */
export function SectionTitle({
  children,
  order = 2,
}: {
  children: ReactNode;
  order?: 2 | 3;
}) {
  return (
    <Title order={order} size="h3">
      {children}
    </Title>
  );
}
