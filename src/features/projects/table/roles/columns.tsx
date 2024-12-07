import { ColumnDef } from "@tanstack/react-table";

import { RolePublicWithInvitationKeys } from "@/api";

import CreateInvitationKeyButton from "./create-invitation-key-button";
import DeleteInvitationKeyButton from "./delete-invitation-key-button";

export const columns: ColumnDef<RolePublicWithInvitationKeys>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    cell: ({ row }) => {
      const invitationKey = row.original.invitation_keys[0]?.key;
      return <div>{invitationKey ?? "-"}</div>;
    },
    header: "Invitation Key",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const invitationKey = row.original.invitation_keys[0];

      return invitationKey === undefined ? (
        <CreateInvitationKeyButton role={row.original} />
      ) : (
        <DeleteInvitationKeyButton role={row.original} />
      );
    },
  },
];
