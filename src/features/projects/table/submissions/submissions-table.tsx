import { SubmissionPublic } from "@/api";
import { DataTable } from "@/components/ui/data-table";

import { columns, columnsWithUser } from "./columns";

type OwnProps = {
  data: SubmissionPublic[];
  showUser: boolean;
};

const SubmissionsTable: React.FC<OwnProps> = ({ data, showUser }) => {
  return <DataTable columns={showUser ? columnsWithUser : columns} data={data} />;
};

export default SubmissionsTable;
