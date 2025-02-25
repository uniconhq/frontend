import { Trash } from "lucide-react";
import { useState } from "react";

import { FileOrm } from "@/api";
import FileInputButton from "@/components/form/inputs/file-input-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateShort } from "@/utils/date";

type OwnProps = {
  problemId: number;
  supportingFiles: FileOrm[];
};

const EditProblemFilesSection: React.FC<OwnProps> = ({ supportingFiles }) => {
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);
  const hasSelectedFiles = selectedFileIds.length > 0;

  return (
    <div className="flex w-full flex-col items-start gap-6 lg:flex-row lg:gap-0">
      <div className="sticky top-0">
        <h2 className="min-w-[200px] text-lg font-medium">Files</h2>
      </div>
      <div className="flex w-full flex-col gap-4">
        <div className="flex gap-2">
          <FileInputButton
            onFileChange={() => {}}
            buttonText="Add file"
            buttonSize="default"
            className=""
            iconClassName=""
          />
          {hasSelectedFiles && (
            <Button type="button" variant="destructive">
              <Trash />
              Delete files
            </Button>
          )}
        </div>
        {/* File table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Checkbox
                  checked={hasSelectedFiles}
                  onClick={() => {
                    setSelectedFileIds(hasSelectedFiles ? [] : supportingFiles.map((file) => file.id!));
                  }}
                />
              </TableHead>
              <TableHead>File name</TableHead>
              <TableHead>Date added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {supportingFiles
              // This should never happen.
              .filter((file) => file.id !== null && file.id !== undefined)
              .map((file) => (
                <TableRow key={file.id}>
                  <TableCell>
                    <Checkbox
                      checked={file.id ? selectedFileIds.includes(file.id) : false}
                      onClick={() => {
                        setSelectedFileIds((prev) =>
                          prev.includes(file.id!) ? prev.filter((id) => id !== file.id) : [...prev, file.id!],
                        );
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <a
                      className="underline decoration-gray-500 hover:decoration-white"
                      href={import.meta.env.VITE_BACKEND_URL + "/files/" + file.key}
                      download={file.path.split("/").pop()!}
                    >
                      {file.path}
                    </a>
                  </TableCell>
                  <TableCell>{formatDateShort(file.created_at)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default EditProblemFilesSection;
