import { TextInput as MantineTextInput } from '@mantine/core';

/**
 * A date and a time as the browser's own field takes them, in the viewer's
 * local time (`2026-06-01T17:00`, seconds when `seconds`). The page converts
 * to and from the time it stores; this only shows and takes the local value.
 */
export function DateTimeInput({
  label,
  value,
  onChange,
  description,
  disabled = false,
  seconds = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  disabled?: boolean;
  seconds?: boolean;
}) {
  return (
    <MantineTextInput
      type="datetime-local"
      step={seconds ? 1 : 60}
      label={label}
      description={description}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      disabled={disabled}
      radius="sm"
    />
  );
}
