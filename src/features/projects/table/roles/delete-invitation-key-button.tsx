import { useState } from "react";

import { RolePublicWithInvitationKeys } from "@/api";
import ConfirmationDialog from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";

import { useDeleteInvitationKey } from "../../queries";

type OwnProps = {
  role: RolePublicWithInvitationKeys;
};

const DeleteInvitationKeyButton: React.FC<OwnProps> = ({ role }) => {
  const deleteInvitationKeyMutation = useDeleteInvitationKey(role.project_id, role.id);

  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      {dialogOpen && (
        <ConfirmationDialog setOpen={setDialogOpen} onConfirm={() => deleteInvitationKeyMutation.mutate()} />
      )}
      <Button variant="destructive" onClick={() => setDialogOpen(true)}>
        delete
      </Button>
    </>
  );
};

export default DeleteInvitationKeyButton;
