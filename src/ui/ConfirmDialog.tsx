import { Group, Stack } from '@mantine/core';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { ErrorBlock } from './feedback/ErrorBlock';

/**
 * A dialog that asks before something is done: its text, the refusal under
 * the `refused` heading if the last try failed, then the confirm button and
 * the cancel button, which closes it.
 */
export function ConfirmDialog({
  opened,
  onClose,
  title,
  children,
  confirm,
  onConfirm,
  variant = 'primary',
  loading = false,
  disabled = false,
  cancel = 'Cancel',
  error = null,
  refused,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirm: string;
  onConfirm: () => void;
  variant?: 'primary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  cancel?: string;
  error?: unknown;
  refused?: string;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title={title}>
      <Stack gap="sm">
        {children}
        {error !== null && error !== undefined && (
          <ErrorBlock error={error} compact alert heading={refused} />
        )}
        <Group gap="xs">
          <Button
            variant={variant}
            loading={loading}
            disabled={disabled}
            onClick={onConfirm}
          >
            {confirm}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {cancel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
