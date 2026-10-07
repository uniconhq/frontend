import { Group, Radio } from '@mantine/core';

/**
 * One choice of a few, all in view at once, under a label that names what is
 * being chosen. It reads out as a radio group, so the arrow keys move between
 * the options.
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
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  /** A line under the label, such as why the choice is held. */
  description?: string;
  disabled?: boolean;
}) {
  return (
    <Radio.Group
      label={label}
      description={description}
      value={value}
      onChange={onChange}
    >
      <Group gap="md" mt={4}>
        {options.map((option) => (
          <Radio
            key={option.value}
            value={option.value}
            label={option.label}
            disabled={disabled}
          />
        ))}
      </Group>
    </Radio.Group>
  );
}
