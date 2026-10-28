import { TextInput as MantineTextInput } from '@mantine/core';
import type { ReactNode, Ref } from 'react';
import { useFieldLabel } from './FieldLabel';

/**
 * A one-line field with its label always shown, since a placeholder is gone
 * the moment someone types. `placeholder` is for a format or a default
 * ("10 MB"), which helps only until something is typed; what is needed while
 * typing goes in `description`, a short line under the box. Hints sit under
 * the box, as the theme puts them for every field, so fields side by side
 * start their boxes on one line. `info` is background behind an ⓘ beside the
 * label. `maxLength`, when given, is the most characters the field takes.
 * `inputMode="decimal"` asks a phone for its number keys, for a field that
 * takes a number. `ref` is the input itself, for moving the focus to it.
 * `error`, when given, is what the server refused about the field: it reads
 * under it and marks the field invalid. `onCommit`, when given, is called
 * when the field is left or Enter is pressed in it, for a field whose change
 * applies once the person is done typing. `autoFocus` takes the focus as
 * the field appears, inside a dialog too, which otherwise gives it to its
 * first button. `labelHidden` names the field for a screen reader alone, for
 * a field whose row already says what it is.
 */
export function TextInput({
  label,
  value,
  onChange,
  description,
  placeholder,
  info,
  error,
  required = false,
  maxLength,
  inputMode,
  disabled = false,
  ref,
  onCommit,
  autoFocus = false,
  labelHidden = false,
  width,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  placeholder?: string;
  info?: ReactNode;
  error?: string;
  required?: boolean;
  maxLength?: number;
  inputMode?: 'decimal';
  disabled?: boolean;
  ref?: Ref<HTMLInputElement>;
  onCommit?: () => void;
  autoFocus?: boolean;
  labelHidden?: boolean;
  width?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const { inputLabel, id, wrap } = useFieldLabel({ label, info, required });
  return wrap(
    <MantineTextInput
      ref={ref}
      id={id}
      label={labelHidden ? undefined : inputLabel}
      aria-label={labelHidden ? label : undefined}
      description={description}
      placeholder={placeholder}
      error={error}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      required={required}
      maxLength={maxLength}
      inputMode={inputMode}
      disabled={disabled}
      style={{
        width:
          width === undefined
            ? undefined
            : { xs: '5rem', sm: '12rem', md: '14rem', lg: '16rem' }[width],
        maxWidth: '100%',
      }}
      radius="sm"
      onBlur={onCommit}
      autoFocus={autoFocus}
      data-autofocus={autoFocus ? true : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onCommit !== undefined) {
          event.preventDefault();
          onCommit();
        }
      }}
    />,
  );
}
