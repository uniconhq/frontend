import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { CreateForm, type SecondField } from './CreateForm';

/**
 * Opens the create form in a dialog, so no form sits open on a hub. A refusal
 * keeps what was typed; closing drops it and puts focus back on the button.
 */
export function CreateButton({
  openLabel,
  intro,
  second,
  submitLabel,
  pending,
  error,
  onOpen,
  onSubmit,
  children,
}: {
  /** Also the dialog's title. */
  openLabel: string;
  intro?: ReactNode;
  second: SecondField;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  /** Called as the dialog opens, to forget the last refusal. */
  onOpen: () => void;
  /** More fields under the two lines, such as the kind of task. */
  children?: ReactNode;
  /** Resolves once the thing is made. */
  onSubmit: (name: string, second: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  useEffect(() => {
    if (open || !moveFocus.current) return;
    moveFocus.current = false;
    opener.current?.querySelector('button')?.focus();
  }, [open]);

  const close = () => {
    moveFocus.current = true;
    setOpen(false);
  };

  return (
    <div ref={opener}>
      <Button
        onClick={() => {
          onOpen();
          setOpen(true);
        }}
      >
        {openLabel}
      </Button>
      <Modal opened={open} onClose={close} title={openLabel}>
        {open && (
          <CreateForm
            title={openLabel}
            intro={intro}
            second={second}
            submitLabel={submitLabel}
            pending={pending}
            error={error}
            onCancel={close}
            extra={children}
            onSubmit={async (name, other) => {
              await onSubmit(name, other);
              close();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
