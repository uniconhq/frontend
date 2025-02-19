import { OutputSocket } from "@/api";
import { DataTable } from "@/components/ui/data-table";

import { columns } from "./columns";

type OwnProps = {
  data: OutputSocket[];
};

const OutputTable: React.FC<OwnProps> = ({ data }) => {
  return <DataTable columns={columns} data={data} hidePagination hideOverflow />;
};

export default OutputTable;
