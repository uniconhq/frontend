import { Group, Radio, Stack } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './RadioGroup.module.css';

export type RadioOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  beside?: ReactNode;
  /** Why a greyed option cannot be chosen, shown under it, not under the group. */
  reason?: string | null;
};

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

/** Options with a sentence under them stand one per line, so each sentence stays by its choice. */
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
      <div key={option.value} className={classes.option}>
        <Radio
          value={option.value}
          label={option.label}
          description={underOption(option, option.disabled === true)}
          disabled={greyed}
        />
        {option.value === value && option.beside !== undefined && (
          <div className={classes.beside}>{option.beside}</div>
        )}
      </div>
    );
  });
  return (
    <Radio.Group
      label={label}
      description={description}
      // Before the options, so it does not read as the last option's.
      inputWrapperOrder={['label', 'description', 'input', 'error']}
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
