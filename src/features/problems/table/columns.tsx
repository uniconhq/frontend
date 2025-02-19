import { ColumnDef } from "@tanstack/react-table";
import { Info, PencilIcon, ScanIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { ProblemBaseWithPermissions } from "@/api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DraftBadge, RestrictedBadge } from "@/features/problems/components/badges";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/utils/date";

export const columns: ColumnDef<ProblemBaseWithPermissions>[] = [
  {
    header: "Name",
    cell: ({ row }) => {
      return (
        <div className="flex items-center gap-2">
          <span>{row.original.name}</span>
          {row.original.restricted && <RestrictedBadge />}
          {!row.original.published && <DraftBadge />}
        </div>
      );
    },
  },
  {
    header: "Starts at",
    cell: ({ row }) => {
      const isOpen = new Date(row.original.started_at) <= new Date();
      return (
        <div className="flex items-center gap-2">
          <span className={cn(!isOpen && "font-bold")}>{formatDateShort(row.original.started_at)}</span>
          {!isOpen && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>This problem is not available yet.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
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
        <div className="flex gap-2">
          {row.original.view && (
            <Link
              to={`/projects/${row.original.project_id}/problems/${id}`}
              className="hover:text-purple-300 hover:underline"
            >
              <ScanIcon />
            </Link>
          )}
          {row.original.edit && (
            <Link
              to={`/projects/${row.original.project_id}/problems/${id}/edit`}
              className="hover:text-purple-300 hover:underline"
            >
              <PencilIcon />
            </Link>
          )}
        </div>
      );
    },
  },
];
