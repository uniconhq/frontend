import { NativeSelect } from '@mantine/core';
import type { ReactNode } from 'react';
import { useFieldLabel } from './FieldLabel';

/**
 * The browser's own select, so it works from the keyboard and on a phone.
 * `placeholder` is an empty first option; `labelHidden` names the box for a screen reader only.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  placeholder,
  description,
  info,
  error,
  required = false,
  disabled = false,
  labelHidden = false,
  width,
}: {
  label: string;
  value: string;
  /** Each choice; a `disabled` one is shown greyed out, its reason said in its own label. */
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
  info?: ReactNode;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  labelHidden?: boolean;
  width?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const { inputLabel, id, wrap } = useFieldLabel({ label, info, required });
  const data =
    placeholder === undefined
      ? options
      : [{ value: '', label: placeholder }, ...options];
  return wrap(
    <NativeSelect
      id={id}
      label={labelHidden ? undefined : inputLabel}
      aria-label={labelHidden ? label : undefined}
      description={description}
      error={error}
      value={value}
      data={data}
      onChange={(event) => onChange(event.currentTarget.value)}
      required={required}
      disabled={disabled}
      style={{
        width:
          width === undefined
            ? undefined
            : { xs: '5rem', sm: '12rem', md: '14rem', lg: '16rem' }[width],
        maxWidth: '100%',
      }}
      radius="sm"
    />,
  );
}
