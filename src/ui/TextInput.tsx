import { TextInput as MantineTextInput } from '@mantine/core';
import type { Ref } from 'react';

/**
 * A one-line field with its label always shown, since a placeholder is gone
 * the moment someone types. `description` is the helper line under the label,
 * and `maxLength`, when given, is the most characters the field takes.
 * `inputMode="decimal"` asks a phone for its number keys, for a field that
 * takes a number. `ref` is the input itself, for moving the focus to it.
 * `error`, when given, is what the server refused about the field: it reads
 * under it and marks the field invalid. `onCommit`, when given, is called
 * when the field is left or Enter is pressed in it, for a field whose change
 * applies once the person is done typing.
 */
export function TextInput({
  label,
  value,
  onChange,
  description,
  error,
  required = false,
  maxLength,
  inputMode,
  disabled = false,
  ref,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  error?: string;
  required?: boolean;
  maxLength?: number;
  inputMode?: 'decimal';
  disabled?: boolean;
  ref?: Ref<HTMLInputElement>;
  onCommit?: () => void;
}) {
  return (
    <MantineTextInput
      ref={ref}
      label={label}
      description={description}
      error={error}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      required={required}
      maxLength={maxLength}
      inputMode={inputMode}
      disabled={disabled}
      radius="sm"
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onCommit !== undefined) {
          event.preventDefault();
          onCommit();
        }
      }}
    />
  );
}
