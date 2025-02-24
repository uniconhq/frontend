import { BanIcon, ExpandIcon, InfoIcon, PenLineIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { ProblemBaseWithPermissions } from "@/api";
import { ExtendedColumnDef } from "@/components/ui/data-table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DraftBadge, RestrictedBadge } from "@/features/problems/components/badges";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/utils/date";

export const columns: ExtendedColumnDef<ProblemBaseWithPermissions>[] = [
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
    header: "Release Date",
    tooltip: "The date when the problem is released and submissions are accepted.",
    cell: ({ row }) => {
      const isOpen = new Date(row.original.started_at) <= new Date();
      return (
        <div className="flex items-center gap-2">
          <span className={cn(!isOpen && "font-medium")}>{formatDateShort(row.original.started_at)}</span>
          {!isOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="h-4 w-4 text-zinc-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>This problem is not available yet.</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      );
    },
  },
  {
    header: "Due Date",
    tooltip: "The date when the problem is due, after which submissions will be considered late.",
    cell: ({ row }) => {
      return formatDateShort(row.original.ended_at);
    },
  },
  {
    header: "Lock Date",
    tooltip: "The date when the problem is locked and no longer accepting submissions.",
    cell: ({ row }) => {
      return row.original.closed_at ? (
        formatDateShort(row.original.closed_at)
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <BanIcon className="h-4 w-4 text-zinc-500" />
          </TooltipTrigger>
          <TooltipContent>
            <p>No lock date set, problem will always be open for submissions</p>
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const id = row.original.id;
      return (
        <div className="flex items-center gap-2">
          {row.original.view && (
            <Link
              to={`/projects/${row.original.project_id}/problems/${id}`}
              className="hover:text-purple-300 hover:underline"
            >
              <ExpandIcon size={18} />
            </Link>
          )}
          {row.original.edit && (
            <Link
              to={`/projects/${row.original.project_id}/problems/${id}/edit`}
              className="hover:text-purple-300 hover:underline"
            >
              <PenLineIcon size={18} />
            </Link>
          )}
        </div>
      );
    },
  },
];
