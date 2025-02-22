import { PlusIcon } from "lucide-react";
import { useCallback, useContext } from "react";

import { OutputSocket, OutputStep } from "@/api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GraphActionType, GraphDispatchContext, SocketDir } from "@/features/problems/components/tasks/graph-context";
import { createSocket } from "@/lib/compute-graph";

import OutputTable from "../output-table/output-table";
import OutputMetadataRow from "./output-metadata-row";

type OwnProps = {
  step: OutputStep;
  editable: boolean;
};

const OutputMetadata: React.FC<OwnProps> = ({ step, editable }) => {
  // NOTE: Control sockets are handled separately by parent `StepNode` component
  const sockets = step.inputs.filter((socket) => socket.type != "CONTROL");
  const dispatch = useContext(GraphDispatchContext)!;

  const updateSocketMetadata = (metadataIndex: number) => (newMetadata: Partial<OutputSocket>) => {
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

  const handleEditSocketLabel = (socketId: string) => (newSocketLabel: string) => {
    dispatch({
      type: GraphActionType.UpdateSocketLabel,
      payload: { stepId: step.id, socketId, newSocketLabel },
    });
  };

  const addInputSocket = useCallback(() => {
    dispatch({
      type: GraphActionType.AddSocket,
      payload: { stepId: step.id, socketDir: SocketDir.Input, socket: createSocket("DATA", "") },
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

  const editableOutputTable = (
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
        {sockets.map((socket, index) => (
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
  );

  return (
    <div className="flex flex-col gap-2 px-2">
      {editable ? editableOutputTable : <OutputTable data={sockets} />}
      {editable && (
        <Button
          size={"sm"}
          className="h-fit w-fit px-1 py-1"
          variant="secondary"
          onClick={addInputSocket}
          type="button"
        >
          <PlusIcon />
        </Button>
      )}
    </div>
  );
};

export default OutputMetadata;
