import { Modal as MantineModal } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * Mantine's Modal, kept for its focus trap, escape handling and scroll lock,
 * which are expensive to get right and invisible when they work. `dismissable:
 * false` is for the session-expired modal, where there is nothing useful behind
 * it.
 */
export function Modal({
  opened,
  onClose,
  title,
  children,
  dismissable = true,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  dismissable?: boolean;
}) {
  return (
    <MantineModal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      radius="md"
      withCloseButton={dismissable}
      closeOnClickOutside={dismissable}
      closeOnEscape={dismissable}
      styles={{
        content: { background: 'var(--unicon-body)' },
        header: { background: 'var(--unicon-body)' },
        title: { fontWeight: 700, fontSize: 15 },
      }}
    >
      {children}
    </MantineModal>
  );
}
