import { Skeleton, Stack } from '@mantine/core';
import { t } from '@/lib/t';

/**
 * Shaped like the content it replaces, so the page does not jump when the data
 * lands. Never a full-page spinner after boot. Announced as loading, so a
 * screen reader hears something rather than silence.
 */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Stack gap="sm" py="md" role="status" aria-label={t('Loading')}>
      <Skeleton height={21} width="40%" radius="sm" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={14} radius="sm" />
      ))}
    </Stack>
  );
}
