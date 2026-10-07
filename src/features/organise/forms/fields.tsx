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
 * not save until it is right.
 */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  whole = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
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
      disabled={disabled}
    />
  );
}

/**
 * A time in the organiser's own zone. `raw` is what the file holds when it is
 * not a time the field can show, which is said under it until it is replaced.
 */
export function TimeField({
  label,
  value,
  onChange,
  raw,
  hint,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  raw?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const description =
    raw !== undefined && value === ''
      ? `The file has "${raw}", which is not a time with a zone.`
      : (hint ?? `In your time, ${zoneName()}.`);
  return (
    <DateTimeInput
      label={label}
      value={value}
      onChange={onChange}
      description={description}
      disabled={disabled}
      seconds={value.length > 16}
    />
  );
}
