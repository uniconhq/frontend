import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { CreateForm, type SecondField } from './CreateForm';

/**
 * Making one org, contest or task: the list's one button, which opens the
 * form in a dialog over the page, so no form sits open on a hub. The thing is
 * made before the create answers, so the dialog closes as soon as it has, and
 * the new thing is in the list or its page is open; a refusal keeps the
 * dialog with what was typed and says why, for the person to try again.
 * Closing the dialog drops what was typed, and puts the focus back on the
 * button.
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
}: {
  /** The button, and the dialog's title, such as "New contest". */
  openLabel: string;
  /** A line above the form, about what is being made. */
  intro?: ReactNode;
  second: SecondField;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  /** Called as the dialog opens, to forget the last refusal. */
  onOpen: () => void;
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
