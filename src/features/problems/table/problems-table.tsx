import { ProblemBaseWithPermissions } from "@/api";
import { DataTable } from "@/components/ui/data-table";

import { columns } from "./columns";

type OwnProps = {
  data: ProblemBaseWithPermissions[];
};

const ProblemsTable: React.FC<OwnProps> = ({ data }) => {
  data.sort((a, b) => {
    // Sort by ascending start date, end date, id.
    return (
      new Date(a.started_at).getTime() - new Date(b.started_at).getTime() ||
      new Date(a.ended_at).getTime() - new Date(b.ended_at).getTime() ||
      a.id - b.id
    );
  });
  return (
    <DataTable
      columns={columns}
      data={data.map((row) => ({
        ...row,
        className: new Date() < new Date(row.started_at) ? "bg-neutral-700/30 !text-gray-400" : "",
      }))}
    />
  );
};

export default ProblemsTable;
