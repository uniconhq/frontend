import { Delete, Plus, Trash } from "lucide-react";

import { Operator, OutputSocket } from "@/api";
import { NodeSlot } from "@/components/node-graph/components/node-slot";
import NodeInput from "@/components/node-graph/components/step/node-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";

type OwnProps = {
  socket: OutputSocket;
  onUpdateSocketMetadata: (newMetadata: Partial<OutputSocket>) => void;
  onEditSocketLabel: (newSocketLabel: string) => void;
  onDeleteSocket: () => void;
};

const OutputMetadataRow: React.FC<OwnProps> = ({
  socket,
  onUpdateSocketMetadata,
  onEditSocketLabel,
  onDeleteSocket,
}) => {
  return (
    <TableRow>
      <TableCell>
        <NodeSlot
          socket={socket}
          type="target"
          hideLabel
          handleStyle={{ width: "20px", borderRadius: "10px", left: "-12px" }}
        />
      </TableCell>
      <TableCell>
        <NodeInput value={socket.label ?? ""} onChange={onEditSocketLabel} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {socket.comparison ? (
            <>
              <Select
                onValueChange={(value) => {
                  onUpdateSocketMetadata({
                    comparison: {
                      ...(socket.comparison ?? {}),
                      operator: value as Operator,
                      value: socket.comparison?.value ?? "",
                    },
                  });
                }}
              >
                <SelectTrigger className="h-fit w-fit p-1">
                  <SelectValue placeholder={socket.comparison?.operator} />
                </SelectTrigger>
                <SelectContent>
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
                variant="secondary"
                onClick={() => onUpdateSocketMetadata({ comparison: null })}
                type="button"
              >
                <Delete className="h-2 w-2" />
              </Button>
            </>
          ) : (
            <Button
              size={"sm"}
              className="h-fit w-fit px-1 py-1"
              variant="secondary"
              onClick={() => onUpdateSocketMetadata({ comparison: { operator: "=", value: "" } })}
              type="button"
            >
              <Plus className="h-2 w-2" />
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Checkbox
          className="rounded-sm border border-gray-500/50"
          checked={socket.public || false}
          onCheckedChange={() => onUpdateSocketMetadata({ public: !socket.public })}
        ></Checkbox>
      </TableCell>
      <TableCell>
        <Button
          size={"sm"}
          className="h-fit w-fit px-1 py-1"
          variant="secondary"
          onClick={onDeleteSocket}
          type="button"
        >
          <Trash className="h-2 w-2" />
        </Button>
      </TableCell>
    </TableRow>
  );
};

export default OutputMetadataRow;
