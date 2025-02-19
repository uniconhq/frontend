import { InputStep, StepSocket } from "@/api";
import { DataTable } from "@/components/ui/data-table";

import { columns } from "./columns";

type OwnProps = {
  step: InputStep;
  data: StepSocket[];
};

const InputTable: React.FC<OwnProps> = ({ data, step }) => {
  return <DataTable columns={columns} data={data.map((row) => ({ ...row, step }))} hidePagination hideOverflow />;
};

export default InputTable;
