import { Checkbox as MantineCheckbox } from '@mantine/core';

/** A yes or no, with its label beside the box and clickable with it. */
export function Checkbox({
  label,
  checked,
  onChange,
  description,
  disabled = false,
  labelHidden = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
  labelHidden?: boolean;
}) {
  return (
    <MantineCheckbox
      label={labelHidden ? undefined : label}
      aria-label={labelHidden ? label : undefined}
      description={description}
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
      disabled={disabled}
      radius="xs"
    />
  );
}
