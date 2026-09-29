import { TextInput as MantineTextInput } from '@mantine/core';
import type { Ref } from 'react';

/**
 * A one-line field with its label always shown, since a placeholder is gone
 * the moment someone types. `description` is the helper line under the label,
 * and `maxLength`, when given, is the most characters the field takes. `ref`
 * is the input itself, for moving the focus to it.
 */
export function TextInput({
  label,
  value,
  onChange,
  description,
  required = false,
  maxLength,
  ref,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  required?: boolean;
  maxLength?: number;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <MantineTextInput
      ref={ref}
      label={label}
      description={description}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      required={required}
      maxLength={maxLength}
      radius="sm"
    />
  );
}
