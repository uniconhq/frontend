import type { ReactNode } from 'react';
import { Input } from '@mantine/core';

/** A labelled value that is shown, not typed, laid out like a field. */
export function ShownField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Input.Wrapper label={label} description={description}>
      {children}
    </Input.Wrapper>
  );
}
