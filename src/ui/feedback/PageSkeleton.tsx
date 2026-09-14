import { Skeleton, Stack } from '@mantine/core';

/**
 * Shaped like the content it replaces, so the page does not jump when the data
 * lands. Never a full-page spinner after boot.
 */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Stack gap="sm" py="md">
      <Skeleton height={21} width="40%" radius="sm" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={14} radius="sm" />
      ))}
    </Stack>
  );
}
