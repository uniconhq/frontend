import { useId, type ReactNode } from 'react';
import { Input } from '@mantine/core';
import { InfoTip } from './InfoTip';
import classes from './FieldLabel.module.css';

/**
 * A field's label with its ⓘ beside it, for a field that has background to
 * give. The ⓘ sits beside the label rather than inside it, so the field is
 * still named by its label alone, and clicking the ⓘ opens it rather than
 * moving to the box. Without `info` the field keeps Mantine's own label, and
 * this adds nothing.
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
