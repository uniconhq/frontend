import { Plus } from "lucide-react";
import { useCallback, useContext } from "react";

import { InputStep, StepSocket } from "@/api";
import FileInputButton from "@/components/form/inputs/file-input-button";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  GraphActionType,
  GraphContext,
  GraphDispatchContext,
  SocketDir,
} from "@/features/problems/components/tasks/graph-context";
import { createSocket } from "@/lib/compute-graph";
import { uuid } from "@/lib/utils";

import InputTable from "../input-table/input-table";
import InputMetadataRow from "./input-metadata-row";

type OwnProps = {
  step: InputStep;
};

const InputMetadata: React.FC<OwnProps> = ({ step }) => {
  const { edit } = useContext(GraphContext)!;
  const dispatch = useContext(GraphDispatchContext)!;

  const isStepEditable = !step.is_user;
  const showEditElements = edit && isStepEditable;

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
          data: {
            name: "file.py",
            content: "print('Hello World')",
          },
        },
      },
    });
  };

  const addOutputSocket = useCallback(() => {
    dispatch({
      type: GraphActionType.AddSocket,
      payload: { stepId: step.id, socketDir: SocketDir.Output, socket: createSocket("DATA", "") },
    });
  }, [dispatch, step.id]);

  if (!showEditElements) {
    return <InputTable data={step.outputs} step={step} />;
  }

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
    dispatch({
      type: GraphActionType.UpdateSocketMetadata,
      payload: {
        stepId: step.id,
        socketId: socket.id,
        socketMetadata: { data: "" },
      },
    });
  };

  return (
    <div>
      <div className="rounded-md border">
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
            {step.outputs.map((socket) => (
              <InputMetadataRow
                key={socket.id}
                socket={socket}
                onDelete={deleteSocket(socket.id)}
                onEditSocketLabel={handleEditSocketLabel(socket.id)}
                onChangeToFile={handleSocketChangeToFile(socket)}
                onChangeToValue={onChangeToValue(socket)}
                onChangeValue={onChangeValue(socket)}
                step={step}
                isEditable={showEditElements && socket.type !== "CONTROL"}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex gap-2">
        <Button
          size={"sm"}
          className="mt-3 h-fit w-fit px-1 py-1"
          variant={"secondary"}
          onClick={addOutputSocket}
          type="button"
        >
          <Plus className="h-2 w-2" />
        </Button>
        <FileInputButton
          multiple
          buttonText="File"
          onFileChange={(files) => {
            if (!files) {
              return;
            }
            for (const file of files) {
              if (file.type.startsWith("text")) {
                const reader = new FileReader();
                reader.onload = (e) => {
                  const fileContent = (e.target?.result as string).trim();
                  dispatch({
                    type: GraphActionType.AddSocket,
                    payload: {
                      stepId: step.id,
                      socketDir: SocketDir.Output,
                      socket: {
                        ...createSocket("DATA", file.name),
                        id: uuid(),
                        data: {
                          path: file.name,
                          content: fileContent,
                          trusted: true,
                        },
                      },
                    },
                  });
                };
                reader.readAsText(file);
              }
              // TODO: handle minio case
            }
          }}
        />
        <FileInputButton
          buttonText="Folder"
          webkitdirectory="true"
          onFileChange={(files) => {
            if (!files) {
              return;
            }
            for (const file of files) {
              // pyproject.toml had file.type === ""
              if (file.type.startsWith("text") || file.type === "") {
                const reader = new FileReader();
                reader.onload = (e) => {
                  const fileContent = (e.target?.result as string).trim();
                  dispatch({
                    type: GraphActionType.AddSocket,
                    payload: {
                      stepId: step.id,
                      socketDir: SocketDir.Output,
                      socket: {
                        ...createSocket("DATA", file.webkitRelativePath),
                        id: uuid(),
                        data: {
                          path: file.webkitRelativePath,
                          content: fileContent,
                          trusted: true,
                        },
                      },
                    },
                  });
                };
                reader.readAsText(file);
              } else {
                console.log({ file });
              }
              // TODO: handle minio case
            }
          }}
        />
      </div>
    </div>
  );
};

export default InputMetadata;
