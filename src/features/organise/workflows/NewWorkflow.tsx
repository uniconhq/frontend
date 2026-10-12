import { useState } from 'react';
import { useNavigate } from 'react-router';
import { $api, queryView } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { RadioGroup } from '@/ui/RadioGroup';
import { Select } from '@/ui/Select';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { useMe } from '@/session';
import { workflowPath } from '@/lib/organiser-paths';
import { workflowOwners } from '../roles';
import { OwnerAndName } from './Combine';
import classes from './workflows.module.css';

const STARTS = [
  {
    value: 'starter',
    label: 'The starter',
    description:
      'Compiles the submission, runs it on each test and compares its output with the test’s answer. Change it from there.',
  },
  {
    value: 'copy',
    label: 'A copy of a version',
    description: 'Every step of a workflow you can read, as it is at that version.',
  },
];

function NewWorkflowForm({
  source,
  onCancel,
}: {
  source: string | null;
  onCancel: () => void;
}) {
  const listed = queryView($api.useQuery('get', '/api/v1/workflows'));
  const [start, setStart] = useState(source === null ? 'starter' : 'copy');
  const [copied, setCopied] = useState(source ?? '');
  const [owner, setOwner] = useState(workflowOwners(useMe())[0] ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const navigate = useNavigate();
  const create = $api.useMutation('post', '/api/v1/workflows');
  const copy = $api.useMutation('post', '/api/v1/workflow-copies');
  const versions =
    listed.state === 'ready'
      ? listed.data.flatMap((item) =>
          item.versions.map((version) => `${item.owner}/${item.name}@${version}`),
        )
      : [];
  const choices =
    source !== null && !versions.includes(source) ? [source, ...versions] : versions;
  const copying = start === 'copy';
  return (
    <form
      className={classes.stack}
      aria-label="New workflow"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const made = copying
          ? copy.mutateAsync({ body: { source: copied, owner, name: name.trim() } })
          : create.mutateAsync({ body: { owner, name: name.trim() } });
        made
          .then((found) => navigate(workflowPath(found.owner, found.name)))
          .catch((caught: unknown) => setError(toApiError(caught)));
      }}
    >
      <RadioGroup
        label="Start from"
        value={start}
        options={STARTS.map((option) => ({
          ...option,
          disabled: option.value === 'copy' && choices.length === 0,
          reason:
            listed.state === 'ready'
              ? 'No workflow you can read has a version yet.'
              : 'The workflows you can read are still loading.',
        }))}
        onChange={setStart}
      />
      {copying && (
        <Select
          label="Version to copy"
          value={copied}
          placeholder="Choose a version"
          options={choices.map((choice) => ({ value: choice, label: choice }))}
          onChange={setCopied}
        />
      )}
      <OwnerAndName owner={owner} name={name} setOwner={setOwner} setName={setName} />
      <BodyText size="sm" tone="secondary">
        It is private, yours to change, until you share it. Tasks choose it once you
        publish a version.
      </BodyText>
      {error !== null && <ErrorBlock error={error} compact />}
      <div className={classes.actions}>
        <Button
          type="submit"
          loading={create.isPending || copy.isPending}
          disabled={name.trim() === '' || (copying && copied === '')}
        >
          Create workflow
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The one way to make a workflow (M32): from the starter, or as a copy of a
 * version of any workflow one can read, under oneself or an org one manages.
 * The Workflows page opens it from "New workflow"; a version's page opens it
 * as "Copy into a new workflow", that version chosen.
 */
export function NewWorkflowButton({
  source = null,
  label = 'New workflow',
}: {
  /** The version to copy, chosen to start with. */
  source?: string | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={source === null ? 'primary' : 'secondary'}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Modal opened={open} onClose={() => setOpen(false)} title="New workflow">
        {open && <NewWorkflowForm source={source} onCancel={() => setOpen(false)} />}
      </Modal>
    </>
  );
}
