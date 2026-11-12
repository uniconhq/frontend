import { Group } from '@mantine/core';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from './Button';
import { TextInput } from './TextInput';

/** Who an invite is for: a username, or an address to mail. */
export type Target = { username: string } | { email: string };

/**
 * A form that invites someone by username or email address, in one field: a
 * Forgejo username has no `@`, so what has one is an address. `onInvite`
 * sends it and says whether it went, which clears the field. `children` sit
 * between the field and Invite; `outcome` after it.
 */
export function InviteForm({
  name,
  className,
  label = 'Username or email address',
  description,
  required = false,
  disabled = false,
  size,
  variant,
  loading,
  blocked = false,
  onInvite,
  children,
  outcome,
}: {
  /** The form's accessible name. */
  name: string;
  className?: string;
  label?: string;
  /** Only to say something the field can't, such as a full team. */
  description?: string;
  required?: boolean;
  disabled?: boolean;
  size?: 'xs';
  variant?: 'secondary';
  loading: boolean;
  /** Invite is off, as when another change is under way. */
  blocked?: boolean;
  onInvite: (target: Target, typed: string) => Promise<boolean>;
  children?: ReactNode;
  outcome?: ReactNode;
}) {
  const [typed, setTyped] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const target = typed.trim();
    if (target === '') return;
    const to = target.includes('@') ? { email: target } : { username: target };
    if (await onInvite(to, target)) setTyped('');
  };

  return (
    <form
      className={className}
      aria-label={name}
      onSubmit={(event) => void submit(event)}
    >
      <TextInput
        label={label}
        description={description}
        value={typed}
        onChange={setTyped}
        disabled={disabled}
        required={required}
      />
      {children}
      <Group gap={6} align="stretch">
        <Button
          size={size}
          variant={variant}
          type="submit"
          loading={loading}
          disabled={disabled || blocked}
        >
          Invite
        </Button>
      </Group>
      {outcome}
    </form>
  );
}
