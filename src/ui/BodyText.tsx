import { Text } from '@mantine/core';
import type { ReactNode } from 'react';

type Tone = 'body' | 'secondary' | 'meta';

/**
 * `tone` picks a text token rather than a grey, so light and dark stay in step.
 * `tone="meta"` is only for small uppercase labels: it does not clear 4.5:1 everywhere.
 */
export function BodyText({
  children,
  tone = 'body',
  size = 'sm',
  mono = false,
}: {
  children: ReactNode;
  tone?: Tone;
  size?: 'sm' | 'md';
  mono?: boolean;
}) {
  return (
    <Text
      size={size}
      c={`var(--unicon-text-${tone})`}
      ff={mono ? 'monospace' : undefined}
    >
      {children}
    </Text>
  );
}
