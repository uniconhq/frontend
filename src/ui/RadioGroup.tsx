import { Group, Radio, Stack } from '@mantine/core';

/**
 * One choice of a few, all in view at once, under a label that names what is
 * being chosen. It reads out as a radio group, so the arrow keys move between
 * the options. An option may carry a sentence under it saying what choosing
 * it means; the options then stand one under the other, so each sentence
 * stays beside its own choice.
 */
export function RadioGroup({
  label,
  value,
  options,
  onChange,
  description,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; description?: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  /** A line under the label, such as why the choice is held. */
  description?: string;
  disabled?: boolean;
}) {
  const explained = options.some((option) => option.description !== undefined);
  const radios = options.map((option) => (
    <Radio
      key={option.value}
      value={option.value}
      label={option.label}
      description={option.description}
      disabled={disabled || option.disabled === true}
    />
  ));
  return (
    <Radio.Group
      label={label}
      description={description}
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
