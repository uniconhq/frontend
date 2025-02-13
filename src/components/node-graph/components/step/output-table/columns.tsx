import { ColumnDef } from "@tanstack/react-table";

import { OutputSocket } from "@/api";

import { NodeSlot } from "../../node-slot";

export const columns: ColumnDef<OutputSocket>[] = [
  {
    id: "handle",
    header: "",
    cell: ({ row }) => {
      const id = row.original.id;
      return (
        <NodeSlot
          key={id}
          id={id}
          label=""
          type="target"
          hideLabel
          style={{ width: "20px", borderRadius: "10px", left: "-10px" }}
        />
      );
    },
  },
  {
    accessorFn: (row) => row.id.replace(/^DATA\.IN\./, ""),
    header: "Socket ID",
  },
  {
    accessorKey: "label",
    header: "Label",
  },
  {
    header: "Expected",
    cell: ({ row }) => {
      if (!row.original.comparison) {
        return <div></div>;
      }

      const operator = row.original.comparison.operator;
      const expected = row.original.comparison.value;
      return (
        <div>
          {operator} {JSON.stringify(expected)}
        </div>
      );
    },
  },
  {
    header: "Public",
    cell: ({ row }) => {
      return <div>{row.original.public ? "Yes" : "No"}</div>;
    },
  },
];
