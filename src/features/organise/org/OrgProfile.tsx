import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { Button } from '@/ui/Button';
import { SectionTitle } from '@/ui/SectionTitle';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { Loaded } from '@/ui/feedback/Loaded';
import { Group } from '@/ui/layout';
import { useFocusOnShow } from '@/lib/use-focus-on-show';
import { useOrgMay } from '../may';
import classes from '../organise.module.css';
import own from './org.module.css';

const ORG = '/api/v1/orgs/{org}';
/** The most a description holds, said in its field. */
const DESCRIPTION_MAX = 255;

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
  const first = useFocusOnShow<HTMLInputElement>();

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
        placeholder={org}
        description="Left empty, the org’s name is shown."
        info="What people see in place of the org's name."
        value={displayName}
        onChange={setDisplayName}
      />
      <TextInput
        label="Description"
        description={`At most ${String(DESCRIPTION_MAX)} characters.`}
        value={description}
        onChange={setDescription}
      />
      {update.error !== null && (
        <div className={classes.panel} role="alert">
          <ErrorBlock error={update.error} compact heading="Couldn’t save" />
        </div>
      )}
      <Group gap="xs">
        <Button type="submit" loading={update.isPending}>
          Save
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
      </Group>
    </form>
  );
}

/**
 * The org's display name and description as the forge holds them. An admin
 * of the org edits both in place; the forge lets only an owner change them,
 * so the backend writes them as the platform once it has checked the admin
 * role. Anyone else holding a role in the org, at the org or at one of its
 * contests or tasks, reads them with no way to edit.
 */
export function OrgProfile({ org }: { org: string }) {
  const administers = useOrgMay(org).edit;
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
      <SectionTitle>Name and description</SectionTitle>
      <Loaded view={view} rows={2}>
        {(profile) =>
          editing ? (
            <EditForm org={org} profile={profile} onDone={close} />
          ) : (
            <>
              <dl className={own.fields} aria-label="About the org">
                <div>
                  <dt>Display name</dt>
                  <dd>
                    {profile.display_name !== null && profile.display_name !== ''
                      ? profile.display_name
                      : 'Not set, so the org’s name is shown.'}
                  </dd>
                </div>
                <div>
                  <dt>Description</dt>
                  <dd>
                    {profile.description !== '' ? profile.description : 'Not set.'}
                  </dd>
                </div>
              </dl>
              {administers && (
                <Group ref={opener} gap="xs">
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                </Group>
              )}
            </>
          )
        }
      </Loaded>
    </div>
  );
}
