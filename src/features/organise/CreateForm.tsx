import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/ui/Button';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import classes from './organise.module.css';

/** The second line, with the most characters it takes when there is a limit. */
export type SecondField = { label: string; description?: string; maxLength?: number };

/**
 * The one form behind New org, New contest and New task: a name, which forge
 * checks, and one more line, a description or a title. The name field has
 * the focus when the form opens. A refusal stays beside the form with what
 * was typed, so a taken name is one edit away from a second try, and the
 * focus goes back to the name field, since the button held it until it went
 * busy.
 *
 * @param onSubmit resolves once the create was accepted, and rejects with
 *   the refusal, which keeps the form as it was.
 * @param onCancel closes the form; without it there is no Cancel button.
 */
export function CreateForm({
  title,
  second,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  title: string;
  second: SecondField;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (name: string, second: string) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState('');
  const [other, setOther] = useState('');
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameField.current?.focus();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onSubmit(name.trim(), other.trim());
    } catch {
      // The refusal is the `error` the page passes back in.
      nameField.current?.focus();
    }
  };

  return (
    <form
      className={classes.form}
      onSubmit={(event) => void submit(event)}
      aria-label={title}
    >
      <SectionTitle order={3}>{title}</SectionTitle>
      <TextInput
        ref={nameField}
        label="Name"
        description="Part of every address, so it cannot change later."
        value={name}
        onChange={setName}
        required
      />
      <TextInput
        label={second.label}
        description={second.description}
        maxLength={second.maxLength}
        value={other}
        onChange={setOther}
      />
      {error !== null && error !== undefined && (
        <div className={classes.panel} role="alert">
          <ErrorBlock error={error} compact />
        </div>
      )}
      <div className={classes.actions}>
        <Button type="submit" loading={pending} disabled={name.trim() === ''}>
          {submitLabel}
        </Button>
        {onCancel !== undefined && (
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
