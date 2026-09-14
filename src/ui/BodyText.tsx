import { Text } from '@mantine/core';
import type { ReactNode } from 'react';

type Tone = 'body' | 'secondary' | 'meta';

/**
 * Prose and helper lines. `tone` picks a text token rather than a grey, so the
 * light and dark twins stay in step. `size` is the handoff's two body sizes:
 * `sm` for helper text and chrome, `md` for prose someone reads a paragraph of.
 * `tone="meta"` is for small uppercase labels, which do not clear 4.5:1 on
 * every surface.
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
