import { Modal as MantineModal } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * Mantine's Modal, kept for its focus trap, escape handling and scroll lock,
 * which are expensive to get right and invisible when they work. `dismissable:
 * false` is for the session-expired modal, where there is nothing useful behind
 * it. `wide` is for a dialog that shows a file or a table, which a form's
 * width would wrap.
 */
export function Modal({
  opened,
  onClose,
  title,
  children,
  dismissable = true,
  wide = false,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  dismissable?: boolean;
  wide?: boolean;
}) {
  return (
    <MantineModal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      size={wide ? 'xl' : 'md'}
      radius="md"
      withCloseButton={dismissable}
      closeButtonProps={{ 'aria-label': 'Close' }}
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
