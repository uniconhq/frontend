import { useContext } from "react";
import { useDebouncedCallback } from "use-debounce";

import { File } from "@/api";

import FileEditor from "./file-editor";
import { GraphActionType, GraphContext, GraphDispatchContext } from "./graph-context";

const GraphFileEditor = () => {
  const { selectedStepId, selectedSocketId, edit, steps } = useContext(GraphContext)!;

  const dispatch = useContext(GraphDispatchContext)!;

  const updateFile = (newFile: File) => {
    dispatch({
      type: GraphActionType.UpdateSocketMetadata,
      payload: {
        stepId: selectedStepId!,
        socketId: selectedSocketId!,
        socketMetadata: { data: newFile },
      },
    });
  };

  const updateFileName = (newName: string) => {
    const splitPath = file.path.split("/");
    const folderPath = splitPath.slice(0, -1).join("/");
    updateFile({ ...file, path: `${folderPath}/${newName}` });
  };

  const updateFileContent = useDebouncedCallback((newFileContent: string) => {
    updateFile({ ...file, content: newFileContent });
  }, 1000);

  const selectedStep = steps.find((step) => step.id === selectedStepId);
  const selectedSocket = selectedStep?.outputs?.find((socket) => socket.id === selectedSocketId);
  if (!selectedStep || !selectedSocket) return null;

  const file = selectedSocket.data as File;
  const isUserInput = "is_user" in selectedStep ? selectedStep.is_user : false;

  return (
    <FileEditor
      key={selectedStepId + file.path}
      fileName={file.path.split("/").pop()!}
      fileContent={file.content}
      onUpdateFileName={updateFileName}
      onUpdateFileContent={updateFileContent}
      onDeselectFile={() => dispatch({ type: GraphActionType.DeselectSocket })}
      editableName={edit && !isUserInput}
      editableContent={edit && !isUserInput}
    />
  );
};

export default GraphFileEditor;
