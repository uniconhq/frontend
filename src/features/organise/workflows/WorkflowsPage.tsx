import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { $api, queryView } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import type { WorkflowItem } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox } from '@/ui/Checkbox';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { workflowPath } from '@/lib/organiser-paths';
import { workflowOwners } from '../roles';
import shared from '../organise.module.css';
import classes from './workflows.module.css';

/**
 * Every workflow the person may read, those they may edit first, each
 * linking to its page; making a new one, which starts as the classic
 * workflow; and combining several versions into one new workflow of their
 * own, which then opens in the editor.
 */
export function WorkflowsPage() {
  const view = queryView($api.useQuery('get', '/api/v1/workflows'));
  return (
    <div className={shared.page}>
      <PageTitle>Workflows</PageTitle>
      <Card>
        {view.state === 'loading' && <PageSkeleton rows={4} />}
        {view.state === 'error' && (
          <ErrorBlock error={view.error} onRetry={view.retry} />
        )}
        {view.state === 'ready' && <Listed items={view.data} />}
      </Card>
      <Card>
        <NewWorkflow />
      </Card>
      {view.state === 'ready' && (
        <Card>
          <Combine items={view.data} />
        </Card>
      )}
    </div>
  );
}

function Listed({ items }: { items: WorkflowItem[] }) {
  const mine = items.filter((item) => item.editable);
  const others = items.filter((item) => !item.editable);
  const list = (label: string, shown: WorkflowItem[]) => (
    <ul className={classes.list} aria-label={label}>
      {shown.map((item) => (
        <li key={`${item.owner}/${item.name}`} className={classes.item}>
          <Link to={workflowPath(item.owner, item.name)}>
            {item.owner}/{item.name}
          </Link>
          <BodyText size="sm" tone="meta">
            {item.visibility}
            {item.versions.length > 0
              ? ` · ${item.versions.join(', ')}`
              : ' · no version yet'}
          </BodyText>
        </li>
      ))}
    </ul>
  );
  return (
    <div className={shared.stack}>
      <SectionTitle>Yours to edit</SectionTitle>
      {mine.length === 0 ? <BodyText>None yet.</BodyText> : list('Yours to edit', mine)}
      <SectionTitle>You may read</SectionTitle>
      {others.length === 0 ? <BodyText>None.</BodyText> : list('You may read', others)}
    </div>
  );
}

function OwnerAndName({
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

function NewWorkflow() {
  const [owner, setOwner] = useState(workflowOwners(useMe())[0] ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const navigate = useNavigate();
  const create = $api.useMutation('post', '/api/v1/workflows');
  return (
    <form
      className={shared.form}
      aria-label="New workflow"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        create
          .mutateAsync({ body: { owner, name: name.trim() } })
          .then((made) => navigate(workflowPath(made.owner, made.name)))
          .catch((caught: unknown) => setError(toApiError(caught)));
      }}
    >
      <SectionTitle order={3}>New workflow</SectionTitle>
      <BodyText size="sm" tone="secondary">
        It starts as unicon/classic@v2, private, for you to change.
      </BodyText>
      <OwnerAndName owner={owner} name={name} setOwner={setOwner} setName={setName} />
      <div>
        <Button
          size="xs"
          type="submit"
          loading={create.isPending}
          disabled={name.trim() === ''}
        >
          Make it
        </Button>
      </div>
      {error !== null && <ErrorBlock error={error} />}
    </form>
  );
}

function Combine({ items }: { items: WorkflowItem[] }) {
  const versions = items.flatMap((item) =>
    item.versions.map((version) => `${item.owner}/${item.name}@${version}`),
  );
  const [chosen, setChosen] = useState<string[]>([]);
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
