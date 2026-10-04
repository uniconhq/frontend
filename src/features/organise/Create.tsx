import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/Button';
import { CreateForm, type SecondField } from './CreateForm';
import classes from './organise.module.css';

/**
 * Making one org, contest or task. The form is behind a button that opens
 * it, or open from the start on a page that is only the form. The thing is
 * made before the create answers, so the form closes as soon as it has, and
 * the new thing is in the list above; a refusal keeps the form open with
 * what was typed and says why, for the person to try again.
 */
export function Create({
  openLabel,
  title,
  second,
  submitLabel,
  pending,
  error,
  startOpen = false,
  onSubmit,
}: {
  /** The button that opens the form, such as "New contest". */
  openLabel: string;
  title: string;
  second: SecondField;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  /** Open the form at once, with no way to close it, for a page that is only the form. */
  startOpen?: boolean;
  /** Resolves once the thing is made. */
  onSubmit: (name: string, second: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(startOpen);
  const opener = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    opener.current?.querySelector('button')?.focus();
  }, [open]);

  const close = () => {
    moveFocus.current = true;
    setOpen(false);
  };

  if (open) {
    return (
      <CreateForm
        title={title}
        second={second}
        submitLabel={submitLabel}
        pending={pending}
        error={error}
        onCancel={startOpen ? undefined : close}
        onSubmit={async (name, other) => {
          await onSubmit(name, other);
          if (!startOpen) close();
        }}
      />
    );
  }

  return (
    <div ref={opener} className={classes.actions}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {openLabel}
      </Button>
    </div>
  );
}
