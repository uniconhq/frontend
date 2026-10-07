import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { holdsAt } from '../roles';
import classes from '../organise.module.css';
import own from './org.module.css';

const ORG = '/api/v1/orgs/{org}';
/** The most the forge takes: a description of 255 characters, a full name of 100. */
const DESCRIPTION_MAX = 255;
const DISPLAY_NAME_MAX = 100;

type Profile = { display_name: string | null; description: string };

/**
 * The form in place of the fields, starting from what the forge holds. The
 * display name is sent as typed, so emptying it takes the org's own away and
 * the forge shows the org's name; a refusal keeps the form with what was
 * typed and its reason.
 */
function EditForm({
  org,
  profile,
  onDone,
}: {
  org: string;
  profile: Profile;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const update = $api.useMutation('patch', ORG, {
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', ORG, { params: { path: { org } } }).queryKey,
      }),
  });
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [description, setDescription] = useState(profile.description);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await update.mutateAsync({
        params: { path: { org } },
        body: { display_name: displayName.trim(), description: description.trim() },
      });
      onDone();
    } catch {
      // The refusal shows beside the form, which keeps what was typed.
    }
  };

  return (
    <form
      className={classes.form}
      onSubmit={(event) => void submit(event)}
      aria-label="Edit the org"
    >
      <TextInput
        ref={first}
        label="Display name"
        description="What people see in place of the org's name. Empty shows the name."
        value={displayName}
        onChange={setDisplayName}
        maxLength={DISPLAY_NAME_MAX}
      />
      <TextInput
        label="Description"
        description={`At most ${String(DESCRIPTION_MAX)} characters.`}
        value={description}
        onChange={setDescription}
        maxLength={DESCRIPTION_MAX}
      />
      {update.error !== null && (
        <div className={classes.panel} role="alert">
          <ErrorBlock error={update.error} compact />
        </div>
      )}
      <div className={classes.actions}>
        <Button type="submit" loading={update.isPending}>
          Save
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The org's display name and description as the forge holds them. An admin
 * of the org edits both in place; the forge lets only an owner change them,
 * so the backend writes them as the platform once it has checked the admin
 * role. Anyone else holding a role in the org reads them with no way to edit.
 */
export function OrgProfile({ org }: { org: string }) {
  const administers = holdsAt(useMe().roles, { kind: 'org', org }, 'admin');
  const view = queryView($api.useQuery('get', ORG, { params: { path: { org } } }));
  const [editing, setEditing] = useState(false);
  const opener = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    opener.current?.querySelector('button')?.focus();
  }, [editing]);

  const close = () => {
    moveFocus.current = true;
    setEditing(false);
  };

  return (
    <div className={classes.stack}>
      <SectionTitle>About</SectionTitle>
      {view.state === 'loading' && <PageSkeleton rows={2} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' &&
        (editing ? (
          <EditForm org={org} profile={view.data} onDone={close} />
        ) : (
          <>
            <dl className={own.fields} aria-label="About the org">
              <div>
                <dt>Display name</dt>
                <dd>
                  {view.data.display_name !== null && view.data.display_name !== ''
                    ? view.data.display_name
                    : 'None; the name shows.'}
                </dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd>
                  {view.data.description !== '' ? view.data.description : 'None.'}
                </dd>
              </div>
            </dl>
            {administers && (
              <div ref={opener} className={classes.actions}>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              </div>
            )}
          </>
        ))}
      {view.state === 'ready' && !editing && !administers && (
        <BodyText tone="secondary">Only an admin of the org changes these.</BodyText>
      )}
    </div>
  );
}
