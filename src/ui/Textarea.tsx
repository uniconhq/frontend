import { Textarea as MantineTextarea } from '@mantine/core';

/**
 * `mono` is for file contents: lines do not wrap, so columns line up. It does
 * not grow on its own, so a long file scrolls inside and Save stays in place.
 */
export function Textarea({
  label,
  value,
  onChange,
  mono = false,
  readOnly = false,
  autoFocus = false,
  required = false,
  rows = 4,
  description,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  required?: boolean;
  rows?: number;
  description?: string;
  placeholder?: string;
  onCommit?: () => void;
}) {
  return (
    <MantineTextarea
      label={label}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      onBlur={onCommit}
      description={description}
      placeholder={placeholder}
      readOnly={readOnly}
      autoFocus={autoFocus}
      required={required}
      rows={rows}
      resize="vertical"
      radius="sm"
      spellCheck={!mono}
      styles={
        mono
          ? {
              input: {
                fontFamily: 'var(--mantine-font-family-monospace)',
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: 'pre',
                overflowX: 'auto',
              },
            }
          : undefined
      }
    />
  );
}
