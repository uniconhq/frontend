import { ActionIcon } from '@mantine/core';

/**
 * A small square button that shows one sign, such as ↑, ↓ or ✕, for an
 * action on one row of a list: moving it up or down, or taking it out. Its
 * `label` is its full name, read by a screen reader and shown on hover, since
 * the sign alone says only which way. It is outlined as a secondary button
 * is, so a row of them reads as one set beside the row's content.
 */
export function IconButton({
  sign,
  label,
  onClick,
  disabled = false,
  loading = false,
}: {
  /** The one character the button shows. */
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
