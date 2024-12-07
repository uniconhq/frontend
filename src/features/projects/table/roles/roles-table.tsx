import { RolePublicWithInvitationKeys } from "@/api";
import { DataTable } from "@/components/ui/data-table";

import { columns } from "./columns";

type OwnProps = {
  data: RolePublicWithInvitationKeys[];
};

const RolesTable: React.FC<OwnProps> = ({ data }) => {
  return <DataTable columns={columns} data={data} />;
};

export default RolesTable;
