import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { useMe } from '@/session';

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
  const owners = useMe().workflow_owners;
  return (
    <>
      <Select
        label="Owner"
        value={owner}
        options={owners.map((each) => ({ value: each, label: each }))}
        onChange={setOwner}
        description="Yourself, or an org you can create workflows in."
      />
      <TextInput label="Name" value={name} onChange={setName} required />
    </>
  );
}
