"use client";

import { TooltipTrigger } from "@radix-ui/react-tooltip";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { InfoIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";

interface DataWithOptionalClassname {
  className?: string;
}

type ExtendedData<T = object> = T & Partial<DataWithOptionalClassname>;

export type ExtendedColumnDef<TData extends ExtendedData, TValue = unknown> = ColumnDef<TData, TValue> & {
  tooltip?: string;
};

interface DataTableProps<TData extends ExtendedData, TValue> {
  columns: ExtendedColumnDef<TData, TValue>[];
  data: TData[];
  hidePagination?: boolean;
  hideOverflow?: boolean;
}

export function DataTable<TData extends ExtendedData, TValue>({
  columns,
  data,
  hidePagination = false,
  hideOverflow = false,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
  });

  return (
    <div>
      <div>
        <Table hideOverflow={hideOverflow}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      <div className="flex items-center gap-2">
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        {(header.column.columnDef as ExtendedColumnDef<TData, unknown>).tooltip && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <InfoIcon size={15} />
                            </TooltipTrigger>
                            <TooltipContent>
                              {(header.column.columnDef as ExtendedColumnDef<TData, unknown>).tooltip}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={row.original.className || ""}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() !== 0 && !hidePagination && (
        <div className="flex items-center justify-center gap-2 space-x-2 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
