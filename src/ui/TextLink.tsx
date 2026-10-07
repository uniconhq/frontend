import { Text } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * A link that reads as a helper line rather than an action: secondary text,
 * still underlined so it is visibly a link. The action a page is about is a
 * Button; this is for the way round it, like creating an account or changing
 * a detail in Forgejo. `newTab` opens it in a tab of its own that is told
 * nothing about this one, and `label` names it where its text alone is
 * shared by several links on the page.
 */
export function TextLink({
  href,
  children,
  newTab = false,
  label,
}: {
  href: string;
  children: ReactNode;
  newTab?: boolean;
  label?: string;
}) {
  return (
    <Text
      component="a"
      href={href}
      size="sm"
      c="var(--unicon-text-secondary)"
      td="underline"
      aria-label={label}
      {...(newTab && { target: '_blank', rel: 'noopener noreferrer' })}
    >
      {children}
    </Text>
  );
}
