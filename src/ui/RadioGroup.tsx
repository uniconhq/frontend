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
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Radio.Group label={label} value={value} onChange={onChange}>
      <Group gap="md" mt={4}>
        {options.map((option) => (
          <Radio key={option.value} value={option.value} label={option.label} />
        ))}
      </Group>
    </Radio.Group>
  );
}
