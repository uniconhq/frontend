import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/Button';
import { CreateForm, type SecondField } from './CreateForm';
import { FollowProvisioning } from './provisioning/FollowProvisioning';
import { pageOf, type Following } from './provisioning/target';
import classes from './organise.module.css';

/**
 * Making one org, contest or task at a time. The form is behind a button
 * that opens it, or open from the start on a page that is only the form.
 * Once the create is accepted the form is replaced by the progress of what
 * was asked for, so a second one cannot be started beside it; the button to
 * start another comes back when that one is ready. A refusal keeps the form
 * open with what was typed.
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
  /** Resolves with what to follow once the create was accepted. */
  onSubmit: (name: string, second: string) => Promise<Following>;
}) {
  const [open, setOpen] = useState(startOpen);
  const [following, setFollowing] = useState<Following | null>(null);
  const [ready, setReady] = useState(false);
  const opener = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    opener.current?.querySelector('button')?.focus();
  }, [open]);

  const start = () => {
    setFollowing(null);
    setReady(false);
    setOpen(true);
  };

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
          const accepted = await onSubmit(name, other);
          setFollowing(accepted);
          setReady(false);
          setOpen(false);
        }}
      />
    );
  }

  return (
    <div className={classes.stack}>
      {following !== null && (
        <FollowProvisioning
          key={pageOf(following.target)}
          {...following}
          onReady={() => setReady(true)}
        />
      )}
      {(following === null || ready) && (
        <div ref={opener} className={classes.actions}>
          <Button variant="secondary" onClick={start}>
            {openLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
