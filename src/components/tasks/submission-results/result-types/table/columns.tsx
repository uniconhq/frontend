import { ColumnDef } from "@tanstack/react-table";

import { OutputSocket, Testcase } from "@/api";

export type Comparison = {
  operator: "<" | "=" | ">";
  value: boolean;
};

export type SocketMetadata = {
  id: string;
  label: string;
  comparison?: Comparison;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  public: boolean;
};

export type Result = {
  value: unknown;
  socketMetadata: OutputSocket;
  testcase: Testcase;
  id: string;
  correct: boolean;
  className?: string;
};

export const columns: ColumnDef<Result>[] = [
  {
    accessorKey: "socketMetadata.label",
    header: "label",
  },
  {
    accessorFn: ({ value }) => JSON.stringify(value),
    header: "value",
  },
  {
    id: "expected",
    header: "expected",
    cell: ({ row }) => {
      const socketMetadata = row.original.socketMetadata;
      if (!socketMetadata.comparison) {
        return <div></div>;
      }

      const operator = socketMetadata.comparison.operator;
      const expected = socketMetadata.comparison.value;
      return (
        <div>
          {operator} {JSON.stringify(expected)}
        </div>
      );
    },
  },
];
