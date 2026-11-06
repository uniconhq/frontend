import { useId, type ReactNode } from 'react';
import { Input } from '@mantine/core';
import { InfoTip } from './InfoTip';
import classes from './FieldLabel.module.css';

/**
 * The ⓘ sits beside the label, not inside it, so the field is named by its
 * label alone and clicking the ⓘ does not move to the box.
 */
export function useFieldLabel({
  label,
  info,
  required = false,
}: {
  label: string;
  info: ReactNode | undefined;
  required?: boolean;
}): {
  /** What the input takes as its own `label`: the label, or nothing when it sits above. */
  inputLabel: string | undefined;
  id: string | undefined;
  wrap: (field: ReactNode) => ReactNode;
} {
  const id = useId();
  if (info === undefined || info === null) {
    return { inputLabel: label, id: undefined, wrap: (field) => field };
  }
  return {
    inputLabel: undefined,
    id,
    wrap: (field) => (
      <div>
        <div className={classes.row}>
          <Input.Label htmlFor={id} required={required}>
            {label}
          </Input.Label>
          <InfoTip about={label}>{info}</InfoTip>
        </div>
        {field}
      </div>
    ),
  };
}
