import { Progress as MantineProgress } from '@mantine/core';

/**
 * How far something has got, from 0 to 100, as a progress bar a screen reader
 * reads with its name and its percentage.
 */
export function Progress({ value, label }: { value: number; label: string }) {
  return <MantineProgress value={value} aria-label={label} size="sm" radius="xs" />;
}
