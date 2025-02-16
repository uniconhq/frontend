import { ColumnDef } from "@tanstack/react-table";

import { InputStep, StepSocket } from "@/api";
import { isFile } from "@/lib/utils";

import { NodeSlot } from "../../node-slot";
import ViewFileButton from "./view-file-button";

export const columns: ColumnDef<StepSocket & { step: InputStep }>[] = [
  {
    accessorFn: (row) => row.label,
    header: "Label",
  },
  {
    header: "Value",
    cell: ({ row }) => {
      const data = row.original.data;
      return (
        <div>
          {data && isFile(data) ? (
            <ViewFileButton socket={row.original} step={row.original.step} />
          ) : (
            JSON.stringify(data)
          )}
        </div>
      );
    },
  },
  {
    id: "handle",
    header: "",
    cell: ({ row }) => {
      const socket = row.original;
      return (
        <NodeSlot
          key={socket.id}
          socket={socket}
          type="source"
          hideLabel
          style={{ width: "20px", borderRadius: "10px", right: "-12px" }}
        />
      );
    },
  },
];
