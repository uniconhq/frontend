import type { ReactNode } from 'react';
import { Button } from './Button';

/**
 * A link that looks like a button, for the trips that leave the app: signing in
 * is a full-page navigation the browser has to perform, which a fetch cannot
 * do.
 */
export function LinkButton({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Button href={href} variant={variant}>
      {children}
    </Button>
  );
}
