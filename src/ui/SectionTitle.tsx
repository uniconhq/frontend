import { Title } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * A heading inside a page or a card: 15px/600 from the type scale. Size and
 * level are separate on purpose: the design has one look for every heading
 * below the page title, but a screen reader walking the page needs the levels
 * to follow the nesting.
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
