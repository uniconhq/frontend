import { Trash } from "lucide-react";

import { InputStep, StepSocket } from "@/api";
import ConfirmationDialog from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { isFile } from "@/lib/utils";

import { NodeSlot } from "../../node-slot";
import ViewFileButton from "../input-table/view-file-button";
import NodeInput from "../node-input";

type OwnProps = {
  socket: StepSocket;
  onDelete: () => void;
  onEditSocketLabel: (newValue: string) => void;
  onChangeToFile: () => void;
  // this means changing from file to not file
  onChangeToValue: () => void;
  onChangeValue: (newValue: string) => void;
  step: InputStep;
  // note: this does not control whether you can connect an edge to this socket
  // connection is always allowed
  isEditable: boolean;
};

const InputMetadataRow: React.FC<OwnProps> = ({
  socket,
  onDelete,
  onEditSocketLabel,
  onChangeToFile,
  onChangeToValue,
  onChangeValue,
  step,
  isEditable,
}) => {
  return (
    <TableRow>
      <TableCell>
        {isEditable && (
          <Button size={"sm"} className="h-fit w-fit px-1 py-1" variant="secondary" onClick={onDelete} type="button">
            <Trash className="h-2 w-2" />
          </Button>
        )}
      </TableCell>
      <TableCell>
        {isEditable ? (
          <NodeInput value={socket.label ?? ""} onChange={onEditSocketLabel} />
        ) : (
          <span>{socket.label}</span>
        )}
      </TableCell>
      <TableCell>
        {socket.data && isFile(socket.data) ? (
          <div className="flex gap-2">
            <ViewFileButton step={step} socket={socket} />
            {isEditable && (
              <ConfirmationDialog
                onConfirm={onChangeToValue}
                description="Are you sure you want to change this file to a primitive value?"
              >
                <Button size="sm" className="h-fit w-fit px-1 py-1" variant="secondary" type="button">
                  Change to value
                </Button>
              </ConfirmationDialog>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            {isEditable ? (
              <NodeInput value={JSON.stringify(socket.data)} onChange={onChangeValue} />
            ) : (
              <span>{JSON.stringify(socket.data)}</span>
            )}
            {isEditable && (
              <ConfirmationDialog
                onConfirm={onChangeToFile}
                description="Are you sure you want to change this value to a file?"
              >
                <Button size="sm" className="h-fit w-fit px-1 py-1" variant="secondary" type="button">
                  Change to file
                </Button>
              </ConfirmationDialog>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        <NodeSlot
          handleStyle={{ width: "20px", borderRadius: "10px", right: "-12px" }}
          socket={socket}
          type="source"
          hideLabel
        />
      </TableCell>
    </TableRow>
  );
};

export default InputMetadataRow;
