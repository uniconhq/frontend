import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { useMe } from '@/session';
import { workflowOwners } from '../roles';

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
