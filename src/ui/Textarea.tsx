import { Textarea as MantineTextarea } from '@mantine/core';

/**
 * A multi-line field. `mono` is for file contents, where columns line up and
 * a stray space has to be visible, so lines do not wrap. It is `rows` tall and
 * the person can drag it taller; it does not grow on its own, so a long file
 * scrolls inside it and the save button stays in place. `readOnly` keeps the
 * text as it is while something is working on it, and `autoFocus` takes the
 * focus as the field appears.
 */
export function Textarea({
  label,
  value,
  onChange,
  mono = false,
  readOnly = false,
  autoFocus = false,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  rows?: number;
}) {
  return (
    <MantineTextarea
      label={label}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      readOnly={readOnly}
      autoFocus={autoFocus}
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
