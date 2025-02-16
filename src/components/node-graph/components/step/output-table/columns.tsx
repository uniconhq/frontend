import { ColumnDef } from "@tanstack/react-table";

import { OutputSocket } from "@/api";

import { NodeSlot } from "../../node-slot";

export const columns: ColumnDef<OutputSocket>[] = [
  {
    id: "handle",
    header: "",
    cell: ({ row }) => {
      const socket = row.original;
      return (
        <NodeSlot
          key={socket.id}
          socket={socket}
          type="target"
          hideLabel
          style={{ width: "20px", borderRadius: "10px", left: "-12px" }}
        />
      );
    },
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
