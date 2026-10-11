import type { ReactNode } from 'react';
import { Skeleton } from '@mantine/core';
import type { QueryView } from '@/api/query';
import { describeError } from '@/api/describe-error';
import type { ApiError } from '@/api/problem';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ErrorBlock } from './ErrorBlock';
import { PageSkeleton } from './PageSkeleton';
import classes from './Loaded.module.css';

/**
 * The one way a read shows while it loads and when it fails: grey lines
 * shaped like what is coming, then the content; or what went wrong with a
 * way to try again. `rows` is how many lines to hold the place of. `compact`
 * is for a card's one line: a single grey line, and a failure in one line
 * with its retry.
 */
export function Loaded<T>({
  view,
  rows = 3,
  compact = false,
  children,
}: {
  view: QueryView<T>;
  rows?: number;
  compact?: boolean;
  children: (data: T) => ReactNode;
}) {
  if (view.state === 'loading') {
    return compact ? (
      <Skeleton
        height={14}
        width="70%"
        radius="sm"
        role="status"
        aria-label="Loading"
      />
    ) : (
      <PageSkeleton rows={rows} />
    );
  }
  if (view.state === 'error') {
    return compact ? (
      <CompactFailure error={view.error} onRetry={view.retry} />
    ) : (
      <ErrorBlock error={view.error} onRetry={view.retry} />
    );
  }
  return children(view.data);
}

function CompactFailure({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const { title } = describeError(error);
  return (
    <div className={classes.failure} role="alert">
      <BodyText tone="secondary">{title}</BodyText>
      <Button size="xs" variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
