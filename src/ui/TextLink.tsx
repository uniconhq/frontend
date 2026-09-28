import { Text } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * A link that reads as a helper line rather than an action: secondary text,
 * still underlined so it is visibly a link. The action a page is about is a
 * Button; this is for the way round it, like creating an account or changing
 * a detail in Forgejo.
 */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Text
      component="a"
      href={href}
      size="sm"
      c="var(--unicon-text-secondary)"
      td="underline"
    >
      {children}
    </Text>
  );
}
