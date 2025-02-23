import { PlusIcon } from "lucide-react";
import { useCallback, useContext } from "react";
import { useDrop } from "react-dnd";

import { InputStep, StepSocket } from "@/api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  GraphActionType,
  GraphContext,
  GraphDispatchContext,
  SocketDir,
} from "@/features/problems/components/tasks/graph-context";
import { createSocket } from "@/lib/compute-graph";
import { DragItemType } from "@/lib/drag";
import { isFolder, TreeFile, TreeFolder } from "@/lib/files";
import { isFile } from "@/lib/utils";

import InputTable from "../input-table/input-table";
import InputMetadataRow from "./input-metadata-row";

type OwnProps = {
  step: InputStep;
  editable: boolean;
};

const InputMetadata: React.FC<OwnProps> = ({ step, editable }) => {
  const { steps, files } = useContext(GraphContext)!;

  // NOTE: Control sockets are handled separately by parent `StepNode` component
  const sockets = step.outputs.filter((socket) => socket.type !== "CONTROL");
  const dispatch = useContext(GraphDispatchContext)!;

  const deleteSocket = useCallback(
    (socketId: string) => () => {
      dispatch({
        type: GraphActionType.DeleteSocket,
        payload: { stepId: step.id, socketId },
      });
    },
    [dispatch, step.id],
  );

  const handleEditSocketLabel = (socketId: string) => (newSocketLabel: string) => {
    dispatch({
      type: GraphActionType.UpdateSocketLabel,
      payload: { stepId: step.id, socketId, newSocketLabel },
    });
  };

  const handleSocketChangeToFile = (socket: StepSocket) => () => {
    dispatch({
      type: GraphActionType.UpdateSocketMetadata,
      payload: {
        stepId: step.id,
        socketId: socket.id,
        socketMetadata: {
          label: "file.py",
          data: {
            path: "file.py",
            content: "print('Hello World')",
            trusted: true,
          },
        },
      },
    });
  };

  const [, drop] = useDrop<TreeFile | TreeFolder>(
    () => ({
      accept: DragItemType.File,
      drop: (draggedItem) => {
        // copy files to user input
        const addFileToInputStep = (treeFile: TreeFile | TreeFolder) => {
          if (isFolder(treeFile)) {
            treeFile.children.forEach(addFileToInputStep);
          } else {
            // If the file wasn't in the task file list, no-op.
            const file = files.find((file) => file.id === treeFile.id);
            if (!file) return;

            // If the file is already somewhere in the graph, also no-op.
            if (
              steps.some(
                (step) =>
                  step.type === "INPUT_STEP" &&
                  step?.outputs?.some((socket) => isFile(socket.data) && socket.data?.id === file.id),
              )
            )
              return;

            dispatch({
              type: GraphActionType.AddSocket,
              payload: {
                stepId: step.id,
                socketDir: SocketDir.Output,
                socket: { ...createSocket("DATA", file.path), data: file },
              },
            });
          }
        };

        addFileToInputStep(draggedItem);
      },
    }),
    [steps],
  );

  const addOutputSocket = useCallback(() => {
    dispatch({
      type: GraphActionType.AddSocket,
      payload: { stepId: step.id, socketDir: SocketDir.Output, socket: createSocket("DATA", "") },
    });
  }, [dispatch, step.id]);

  const onChangeValue = (socket: StepSocket) => (newValue: string) => {
    dispatch({
      type: GraphActionType.UpdateSocketMetadata,
      payload: {
        stepId: step.id,
        socketId: socket.id,
        socketMetadata: { data: JSON.parse(newValue) },
      },
    });
  };

  const onChangeToValue = (socket: StepSocket) => () => {
    // De-select the socket to close the file editor
    dispatch({ type: GraphActionType.DeselectSocket });
    dispatch({
      type: GraphActionType.UpdateSocketMetadata,
      payload: {
        stepId: step.id,
        socketId: socket.id,
        socketMetadata: { data: "" },
      },
    });
  };

  const editableInputTable = (
    <Table hideOverflow>
      <TableHeader>
        <TableRow>
          <TableHead></TableHead>
          <TableHead>Label</TableHead>
          <TableHead>Value</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sockets.map((socket) => (
          <InputMetadataRow
            key={socket.id}
            socket={socket}
            onDelete={deleteSocket(socket.id)}
            onEditSocketLabel={handleEditSocketLabel(socket.id)}
            onChangeToFile={handleSocketChangeToFile(socket)}
            onChangeToValue={onChangeToValue(socket)}
            onChangeValue={onChangeValue(socket)}
            step={step}
            isEditable={editable && socket.type !== "CONTROL"}
          />
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="flex flex-col gap-2 px-2" ref={drop}>
      {editable ? editableInputTable : <InputTable data={sockets} step={step} />}
      {editable && (
        <Button
          size={"sm"}
          className="h-fit w-fit px-1 py-1"
          variant="secondary"
          onClick={addOutputSocket}
          type="button"
        >
          <PlusIcon />
        </Button>
      )}
    </div>
  );
};

export default InputMetadata;
