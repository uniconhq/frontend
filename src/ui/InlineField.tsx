import { TextInput as MantineTextInput } from '@mantine/core';

/**
 * A short box that stands inside a sentence, as "[100] points shared among
 * the tests passed" has one: named by `label` for a screen reader, since the
 * sentence around it is what a reader sees. `invalid` marks it when what the
 * line says under it is wrong; that line is the caller's. `inputMode="decimal"`
 * asks a phone for its number keys.
 */
export function InlineField({
  label,
  value,
  onChange,
  placeholder,
  invalid = false,
  inputMode,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  inputMode?: 'decimal';
  disabled?: boolean;
}) {
  return (
    <MantineTextInput
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={placeholder}
      error={invalid}
      inputMode={inputMode}
      disabled={disabled}
      radius="sm"
      size="xs"
      w={84}
      display="inline-block"
    />
  );
}
