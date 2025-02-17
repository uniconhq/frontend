import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";

import { ProblemOrm } from "@/api";
import { Badge } from "@/components/ui/badge";

export const columns: ColumnDef<ProblemOrm>[] = [
  {
    accessorKey: "id",
    header: "Problem ID",
  },
  {
    header: "Name",
    cell: ({ row }) => {
      return (
        <div className="flex gap-2">
          <span>{row.original.name}</span>
          {row.original.restricted && <Badge variant={"destructive"}>Restricted</Badge>}
        </div>
      );
    },
  },
  {
    accessorKey: "description",
    header: "Description",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const id = row.original.id;
      return (
        <Link
          to={`/projects/${row.original.project_id}/problems/${id}`}
          className="hover:text-purple-300 hover:underline"
        >
          View
        </Link>
      );
    },
  },
];
