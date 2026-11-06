import { Skeleton, Stack } from '@mantine/core';

/** Shaped like the content it replaces, so the page does not jump when data lands. */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Stack gap="sm" py="md" role="status" aria-label="Loading">
      <Skeleton height={21} width="40%" radius="sm" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={14} radius="sm" />
      ))}
    </Stack>
  );
}
