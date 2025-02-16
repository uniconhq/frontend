import { Plus } from "lucide-react";
import { useCallback, useContext } from "react";

import { OutputSocket, OutputStep } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GraphActionType,
  GraphContext,
  GraphDispatchContext,
  SocketDir,
} from "@/features/problems/components/tasks/graph-context";
import { createSocket } from "@/lib/compute-graph";

import OutputTable from "../output-table/output-table";
import OutputMetadataRow from "./output-metadata-row";

type OwnProps = {
  step: OutputStep;
};

const OutputMetadata: React.FC<OwnProps> = ({ step }) => {
  const { edit } = useContext(GraphContext)!;
  const dispatch = useContext(GraphDispatchContext)!;

  // Does not handle updating socket ids. See handleEditSocketId for that
  const updateSocketMetadata =
    (metadataIndex: number) => (newMetadata: Partial<OutputSocket>) => {
      const { id: _, ...newMetadataWithoutId } = newMetadata;
      dispatch({
        type: GraphActionType.UpdateSocketMetadata,
        payload: {
          stepId: step.id,
          socketId: step.inputs[metadataIndex].id,
          socketMetadata: newMetadataWithoutId,
        },
      });
    };

  const handleEditSocketLabel =
    (socketId: string) => (newSocketLabel: string) => {
      dispatch({
        type: GraphActionType.UpdateSocketLabel,
        payload: { stepId: step.id, socketId, newSocketLabel },
      });
    };

  const addInputSocket = useCallback(() => {
    dispatch({
      type: GraphActionType.AddSocket,
      payload: { stepId: step.id, socketDir: SocketDir.Input, socket: createSocket("DATA", "") }, // prettier-ignore
    });
  }, [dispatch, step]);

  const deleteSocket = useCallback(
    (socketId: string) => () => {
      dispatch({
        type: GraphActionType.DeleteSocket,
        payload: { stepId: step.id, socketId },
      });
    },
    [dispatch, step],
  );

  if (!edit) {
    return <OutputTable data={step.inputs} />;
  }

  return (
    <div>
      <div className="rounded-md border">
        <Table hideOverflow>
          <TableHeader>
            <TableRow>
              {/* Socket */}
              <TableHead></TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Public</TableHead>
              {/* Delete Button */}
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {step.inputs.map((socket, index) => (
              <OutputMetadataRow
                key={socket.id}
                socket={socket}
                onUpdateSocketMetadata={updateSocketMetadata(index)}
                onEditSocketLabel={handleEditSocketLabel(socket.id)}
                onDeleteSocket={deleteSocket(socket.id)}
                isEditable={socket.type != "CONTROL"}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <Button
        size={"sm"}
        className="mt-3 h-fit w-fit px-1 py-1"
        variant={"secondary"}
        onClick={addInputSocket}
        type="button"
      >
        <Plus className="h-2 w-2" />
      </Button>
    </div>
  );
};

export default OutputMetadata;
