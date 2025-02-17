import { ColumnDef } from "@tanstack/react-table";

import { SubmissionPublic } from "@/api";

import ViewProblemButton from "./view-problem-button";
import ViewResultButton from "./view-result-button";

export const columns: ColumnDef<SubmissionPublic>[] = [
  {
    accessorKey: "id",
    header: "Submission ID",
  },
  {
    accessorKey: "definition",
    header: "Problem ID",
    cell: ({ row }) => {
      const problem = row.original.problem;
      return <ViewProblemButton problem={problem} />;
    },
  },
  {
    accessorKey: "submitted_at",
    header: "Submitted At",
    cell: ({ row }) => {
      // This should happen if the submission is not submitted yet
      if (!row.original.submitted_at) {
        return "-";
      }
      return new Date(row.original.submitted_at).toLocaleString();
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const id = row.original.id;
      return <ViewResultButton submissionId={id} />;
    },
  },
];

export const columnsWithUser: ColumnDef<SubmissionPublic>[] = [
  columns[0],
  { header: "User", accessorKey: "user.username" },
  {
    header: "Group",
    cell: ({ row }) => {
      const groups = row.original.user.group_members.map((group_member) => group_member.group.name);

      return groups.join(", ");
    },
  },
  ...columns.slice(1),
];
