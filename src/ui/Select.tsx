import { NativeSelect } from '@mantine/core';
import type { ReactNode } from 'react';
import { useFieldLabel } from './FieldLabel';

/**
 * A choice from a short list, as the browser's own select: it opens with the
 * keyboard, reads out as a list and works on a phone without any help.
 * `placeholder` is an empty first option, for a choice nobody has made yet.
 * `description` reads under the box, as every field's hint does, and
 * `error`, when given, under it too, marking it invalid. `info` is
 * background behind an ⓘ beside the label. `labelHidden` names the box for
 * a screen reader alone, for a box on a row whose place already says what
 * it is, such as the second of a leaderboard's ways to rank.
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
      radius="sm"
    />,
  );
}
