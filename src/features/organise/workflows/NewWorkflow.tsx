import { useState } from 'react';
import { useNavigate } from 'react-router';
import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { useMe } from '@/session';
import { workflowPath } from '@/lib/organiser-paths';
import { workflowOwners } from '../roles';
import { OwnerAndName } from './OwnerAndName';
import classes from './workflows.module.css';

function NewWorkflowForm({ onCancel }: { onCancel: () => void }) {
  const [owner, setOwner] = useState(workflowOwners(useMe())[0] ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const navigate = useNavigate();
  const create = $api.useMutation('post', '/api/v1/workflows');
  return (
    <form
      className={classes.stack}
      aria-label="New workflow"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        create
          .mutateAsync({ body: { owner, name: name.trim() } })
          .then((found) => navigate(workflowPath(found.owner, found.name)))
          .catch((caught: unknown) => setError(toApiError(caught)));
      }}
    >
      <OwnerAndName owner={owner} name={name} setOwner={setOwner} setName={setName} />
      <BodyText size="sm" tone="secondary">
        It starts empty. Add its steps from the tray: primitives, or other workflows as
        boxes.
      </BodyText>
      {error !== null && <ErrorBlock error={error} compact />}
      <div className={classes.actions}>
        <Button type="submit" loading={create.isPending} disabled={name.trim() === ''}>
          Create workflow
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Make an empty draft under oneself or an org one manages. */
export function NewWorkflowButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New workflow</Button>
      <Modal opened={open} onClose={() => setOpen(false)} title="New workflow">
        {open && <NewWorkflowForm onCancel={() => setOpen(false)} />}
      </Modal>
    </>
  );
}
