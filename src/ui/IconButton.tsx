import { ActionIcon } from '@mantine/core';

/** A row action shown as one sign (↑, ↓, ✕); `label` is its full name, since the sign alone is not. */
export function IconButton({
  sign,
  label,
  onClick,
  disabled = false,
  loading = false,
}: {
  sign: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <ActionIcon
      variant="default"
      size={28}
      radius="sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      loading={loading}
      onClick={onClick}
      style={{ borderColor: 'var(--unicon-border-strong)', fontSize: 14 }}
      c={disabled && !loading ? undefined : 'var(--unicon-text-body)'}
    >
      <span aria-hidden>{sign}</span>
    </ActionIcon>
  );
}
