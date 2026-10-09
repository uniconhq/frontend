import { NativeSelect } from '@mantine/core';

/**
 * A choice from a short list, as the browser's own select: it opens with the
 * keyboard, reads out as a list and works on a phone without any help.
 * `placeholder` is an empty first option, for a choice nobody has made yet.
 * `description` reads under the label, and `error`, when given, under the
 * field, marking it invalid.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  placeholder,
  description,
  error,
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const data =
    placeholder === undefined
      ? options
      : [{ value: '', label: placeholder }, ...options];
  return (
    <NativeSelect
      label={label}
      description={description}
      error={error}
      value={value}
      data={data}
      onChange={(event) => onChange(event.currentTarget.value)}
      required={required}
      disabled={disabled}
      radius="sm"
    />
  );
}
