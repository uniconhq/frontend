import { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";

import { ProblemOrm } from "@/api";
import { Badge } from "@/components/ui/badge";
import { formatDateShort } from "@/utils/date";

export const columns: ColumnDef<ProblemOrm>[] = [
  {
    header: "Name",
    cell: ({ row }) => {
      return (
        <div className="flex gap-2">
          <span>{row.original.name}</span>
          {row.original.restricted && (
            <Badge variant={"destructive"}>Restricted</Badge>
          )}
        </div>
      );
    },
  },
  {
    header: "Starts at",
    cell: ({ row }) => {
      return formatDateShort(row.original.started_at);
    },
  },
  {
    header: "Ends at",
    cell: ({ row }) => {
      return formatDateShort(row.original.ended_at);
    },
  },
  {
    id: "actions",
    header: "Actions",
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
