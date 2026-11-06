import { TextInput as MantineTextInput } from '@mantine/core';
import type { ReactNode } from 'react';
import { useFieldLabel } from './FieldLabel';

/**
 * Takes and shows the viewer's local time (`2026-06-01T17:00`); the page
 * converts to and from the time it stores.
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
