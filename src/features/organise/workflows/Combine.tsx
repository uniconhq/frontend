import { useState } from 'react';
import { useNavigate } from 'react-router';
import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { WorkflowItem } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { useMe } from '@/session';
import { workflowPath } from '@/lib/organiser-paths';
import { workflowOwners } from '../roles';
import shared from '../organise.module.css';
import classes from './workflows.module.css';

/** Who a new workflow is made under, of those the person may, and its name. */
export function OwnerAndName({
  owner,
  name,
  setOwner,
  setName,
}: {
  owner: string;
  name: string;
  setOwner: (owner: string) => void;
  setName: (name: string) => void;
}) {
  const owners = workflowOwners(useMe());
  return (
    <>
      <Select
        label="Owner"
        value={owner}
        options={owners.map((each) => ({ value: each, label: each }))}
        onChange={setOwner}
        description="Yourself, or an org where you are a manager or an admin."
      />
      <TextInput label="Name" value={name} onChange={setName} required />
    </>
  );
}

/**
 * Two or more versions combined into one new private workflow, which then
 * opens in the editor; on a workflow's own page, its latest version is
 * chosen to start with.
 */
export function Combine({
  items,
  chosen: first = [],
}: {
  items: WorkflowItem[];
  chosen?: string[];
}) {
  const versions = items.flatMap((item) =>
    item.versions.map((version) => `${item.owner}/${item.name}@${version}`),
  );
  const [chosen, setChosen] = useState<string[]>(first);
  const [owner, setOwner] = useState(workflowOwners(useMe())[0] ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const navigate = useNavigate();
  const combine = $api.useMutation('post', '/api/v1/workflow-combinations');
  if (versions.length < 2) return null;
  return (
    <form
      className={shared.form}
      aria-label="Combine workflows"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        combine
          .mutateAsync({ body: { sources: chosen, owner, name: name.trim() } })
          .then((made) => navigate(workflowPath(made.owner, made.name)))
          .catch((caught: unknown) => setError(toApiError(caught)));
      }}
    >
      <SectionTitle order={3}>Combine workflows</SectionTitle>
      <BodyText size="sm" tone="secondary">
        One new private workflow holding every step of the versions chosen, in their
        order. An input or a test field they declare alike is shared; anything else with
        the same name is numbered.
      </BodyText>
      <fieldset className={classes.stack}>
        <legend>Versions to combine</legend>
        {versions.map((version) => (
          <Checkbox
            key={version}
            label={version}
            checked={chosen.includes(version)}
            onChange={(checked) =>
              setChosen((before) =>
                checked
                  ? [...before, version]
                  : before.filter((each) => each !== version),
              )
            }
          />
        ))}
      </fieldset>
      <OwnerAndName owner={owner} name={name} setOwner={setOwner} setName={setName} />
      <div>
        <Button
          size="xs"
          type="submit"
          loading={combine.isPending}
          disabled={chosen.length < 2 || name.trim() === ''}
        >
          Combine
        </Button>
      </div>
      {error !== null && <ErrorBlock error={error} />}
    </form>
  );
}
