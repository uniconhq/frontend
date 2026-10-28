import type { ReactNode } from 'react';
import { DateTimeInput } from '@/ui/DateTimeInput';
import { TextInput } from '@/ui/TextInput';
import { numberProblem } from './yaml-doc';
import { zoneName } from './times';
import classes from './forms.module.css';

/** Related fields under a small heading, with a line under it when it has one. */
export function Fieldset({
  legend,
  note,
  children,
}: {
  legend: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className={classes.fieldset}>
      <legend className={classes.legend}>{legend}</legend>
      {note !== undefined && (
        <p className={`${classes.note} ${classes.flush}`}>{note}</p>
      )}
      {children}
    </fieldset>
  );
}

/**
 * A number, typed as text so an empty field means "not set" and a half-typed
 * one is not lost; what is wrong with it shows under it, and the form will
 * not save until it is right. `placeholder` is what an empty field comes to,
 * `hint` a short line under the box, `info` background behind an ⓘ beside
 * the label, and `error` what a save was refused for there.
 */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  info,
  error,
  whole = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  placeholder?: string;
  info?: ReactNode;
  error?: string;
  whole?: boolean;
  disabled?: boolean;
}) {
  return (
    <TextInput
      label={label}
      value={value}
      onChange={onChange}
      inputMode="decimal"
      description={numberProblem(value, whole) ?? hint}
      placeholder={placeholder}
      info={info}
      error={error}
      disabled={disabled}
    />
  );
}

/**
 * A time in the organiser's own zone. `raw` is what the file holds when it is
 * not a time the field can show, which is said under it until it is replaced.
 * `hint` replaces the line naming the zone, and `info` is background behind
 * an ⓘ beside the label.
 */
export function TimeField({
  label,
  value,
  onChange,
  raw,
  hint,
  info,
  disabled = false,
  width,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  raw?: string;
  hint?: string;
  info?: ReactNode;
  disabled?: boolean;
  width?: 'lg';
}) {
  const description =
    raw !== undefined && value === ''
      ? `The saved value “${raw}” is not a time with a time zone. Choose the time again.`
      : (hint ?? `In your time, ${zoneName()}.`);
  return (
    <DateTimeInput
      label={label}
      value={value}
      onChange={onChange}
      description={description}
      info={info}
      disabled={disabled}
      seconds={value.length > 16}
      width={width}
    />
  );
}
