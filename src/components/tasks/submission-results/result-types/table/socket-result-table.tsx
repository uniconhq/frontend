import { DataTable } from "@/components/ui/data-table";

import { columns, Result } from "./columns";

type OwnProps = {
  data: Result[];
};

const SocketResultTable: React.FC<OwnProps> = ({ data }) => {
  data.forEach((result) => {
    result.className = result.correct ? "bg-green-800/50 hover:bg-green-800/75" : "bg-red-800/50 hover:bg-red-800/75";
  });
  return <DataTable columns={columns} data={data} />;
};

export default SocketResultTable;
