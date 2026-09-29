import { Anchor } from '@mantine/core';
import { Link } from 'react-router';
import type { ReactNode } from 'react';

/**
 * A link to another page of the app, followed by the router rather than by a
 * full page load. `to` may be a search alone, such as `?file=task.yaml`, which
 * keeps the page and changes what it shows. Links out of the app are
 * TextLink or a Button with `href`.
 */
export function PageLink({
  to,
  children,
  mono = false,
}: {
  to: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <Anchor
      component={Link}
      to={to}
      size="sm"
      c="var(--unicon-text-accent)"
      ff={mono ? 'monospace' : undefined}
    >
      {children}
    </Anchor>
  );
}
