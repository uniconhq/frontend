import { TextInput as MantineTextInput } from '@mantine/core';
import type { ReactNode } from 'react';
import { useFieldLabel } from './FieldLabel';

/**
 * A date and a time as the browser's own field takes them, in the viewer's
 * local time (`2026-06-01T17:00`, seconds when `seconds`). The page converts
 * to and from the time it stores; this only shows and takes the local value.
 * `description` reads under the box, and `info` is background behind an ⓘ
 * beside the label. `width` is as `TextInput`'s; full width when absent.
 */
export function DateTimeInput({
  label,
  value,
  onChange,
  description,
  info,
  disabled = false,
  seconds = false,
  width,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  info?: ReactNode;
  disabled?: boolean;
  seconds?: boolean;
  width?: 'lg';
}) {
  const { inputLabel, id, wrap } = useFieldLabel({ label, info });
  return wrap(
    <MantineTextInput
      id={id}
      type="datetime-local"
      step={seconds ? 1 : 60}
      label={inputLabel}
      description={description}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      disabled={disabled}
      style={width === undefined ? undefined : { width: '16rem', maxWidth: '100%' }}
      radius="sm"
    />,
  );
}
