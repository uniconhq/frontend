import { Delete, Plus, Trash } from "lucide-react";

import { OutputSocket } from "@/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";

import { NodeSlot } from "../../node-slot";
import NodeInput from "../node-input";

type OwnProps = {
  socket: OutputSocket;
  onUpdateSocketMetadata: (newMetadata: Partial<OutputSocket>) => void;
  onEditSocketLabel: (newSocketLabel: string) => void;
  onDeleteSocket: () => void;
  isEditable: boolean;
};

const OutputMetadataRow: React.FC<OwnProps> = ({
  socket,
  onUpdateSocketMetadata,
  onEditSocketLabel,
  onDeleteSocket,
  isEditable,
}) => {
  return (
    <TableRow>
      <TableCell>
        <NodeSlot
          socket={socket}
          type="target"
          hideLabel
          style={{ width: "20px", borderRadius: "10px", left: "-12px" }}
        />
      </TableCell>
      <TableCell>
        {isEditable ? (
          <NodeInput value={socket.label ?? ""} onChange={onEditSocketLabel} />
        ) : (
          <span>{socket.label}</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {socket.comparison ? (
            isEditable ? (
              <>
                <Select>
                  <SelectTrigger className="h-fit w-fit p-1">
                    <SelectValue placeholder={socket.comparison?.operator} />
                  </SelectTrigger>
                  <SelectContent
                    onSelect={(value) =>
                      onUpdateSocketMetadata({
                        comparison: {
                          ...(socket.comparison ?? {
                            operator: "=",
                            value: "",
                          }),
                          value,
                        },
                      })
                    }
                  >
                    <SelectItem value="=">=</SelectItem>
                    <SelectItem value="<">&lt;</SelectItem>
                    <SelectItem value=">">&gt;</SelectItem>
                  </SelectContent>
                </Select>{" "}
                <NodeInput
                  value={JSON.stringify(socket.comparison?.value ?? "")}
                  onChange={(newValue) => {
                    onUpdateSocketMetadata({
                      comparison: {
                        ...(socket.comparison ?? {
                          operator: "=",
                          value: "",
                        }),
                        value: JSON.parse(newValue),
                      },
                    });
                  }}
                />
                <Button
                  size={"sm"}
                  className="h-fit w-fit px-1 py-1"
                  variant={"secondary"}
                  onClick={() =>
                    onUpdateSocketMetadata({
                      comparison: null,
                    })
                  }
                  type="button"
                >
                  <Delete className="h-2 w-2" />
                </Button>
              </>
            ) : (
              <span>
                {socket.comparison.operator}{" "}
                {JSON.stringify(socket.comparison.value)}
              </span>
            )
          ) : (
            isEditable && (
              <Button
                size={"sm"}
                className="h-fit w-fit px-1 py-1"
                variant={"secondary"}
                onClick={() =>
                  onUpdateSocketMetadata({
                    comparison: {
                      operator: "=",
                      value: "",
                    },
                  })
                }
                type="button"
              >
                <Plus className="h-2 w-2" />
              </Button>
            )
          )}
        </div>
      </TableCell>
      <TableCell className="flex items-center justify-center">
        <Checkbox
          className="inline h-4 w-4 rounded-sm border border-gray-500/50"
          checked={socket.public || false}
          onCheckedChange={() => {
            onUpdateSocketMetadata({
              public: !socket.public,
            });
          }}
          disabled={!isEditable}
        ></Checkbox>
      </TableCell>
      <TableCell>
        {isEditable && (
          <Button
            size={"sm"}
            className="h-fit w-fit px-1 py-1"
            variant={"secondary"}
            onClick={onDeleteSocket}
            type="button"
          >
            <Trash className="h-2 w-2" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
};

export default OutputMetadataRow;
