import { Progress as MantineProgress } from '@mantine/core';

export function Progress({ value, label }: { value: number; label: string }) {
  return <MantineProgress value={value} aria-label={label} size="sm" radius="xs" />;
}
