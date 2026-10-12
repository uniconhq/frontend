import { Group, Radio, Stack } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './RadioGroup.module.css';

export type RadioOption = {
  value: string;
  label: string;
  /** What choosing it means, or an example of it, under its label. */
  description?: string;
  disabled?: boolean;
  /** Why a greyed option cannot be chosen, under it, never under the group. */
  reason?: string | null;
};

/** What reads under an option: what it means, then, while greyed, why. */
function underOption(option: RadioOption, greyed: boolean): ReactNode {
  const reason = greyed ? (option.reason ?? null) : null;
  if (reason === null) return option.description;
  return (
    <>
      {option.description !== undefined && (
        <span className={classes.line}>{option.description}</span>
      )}
      <span className={classes.line}>{reason}</span>
    </>
  );
}

/**
 * One choice of a few, all in view at once, under a label that names what is
 * being chosen. It reads out as a radio group, so the arrow keys move between
 * the options. An option may carry a sentence under it saying what choosing
 * it means, such as an example; the options then stand one under the other,
 * so each sentence stays beside its own choice. A greyed option carries why
 * it cannot be chosen under it too. `description` is a line under the label
 * about the choice as a whole, and `error` what a save refused about the
 * option chosen; `required` marks a choice that must be made.
 */
export function RadioGroup({
  label,
  value,
  options,
  onChange,
  description,
  error,
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  options: RadioOption[];
  onChange: (value: string) => void;
  /** A line under the label, such as why the choice is held. */
  description?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const explained = options.some(
    (option) =>
      option.description !== undefined ||
      (option.disabled === true && (option.reason ?? null) !== null),
  );
  const radios = options.map((option) => {
    const greyed = disabled || option.disabled === true;
    return (
      <Radio
        key={option.value}
        value={option.value}
        label={option.label}
        description={underOption(option, option.disabled === true)}
        disabled={greyed}
      />
    );
  });
  return (
    <Radio.Group
      label={label}
      description={description}
      error={error}
      withAsterisk={required}
      value={value}
      onChange={onChange}
    >
      {explained ? (
        <Stack gap="xs" mt={6}>
          {radios}
        </Stack>
      ) : (
        <Group gap="md" mt={4}>
          {radios}
        </Group>
      )}
    </Radio.Group>
  );
}
