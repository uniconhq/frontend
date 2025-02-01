import { useContext } from "react";
import { useDebouncedCallback } from "use-debounce";

import { File } from "@/api";

import FileEditor from "./file-editor";
import {
  GraphActionType,
  GraphContext,
  GraphDispatchContext,
} from "./graph-context";

const GraphFileEditor = () => {
  const { selectedStepId, selectedSocketId, edit, steps } =
    useContext(GraphContext)!;

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

  const updateFileName = (newName: string) =>
    updateFile({ ...file, name: newName });

  const updateFileContent = useDebouncedCallback((newFileContent: string) => {
    updateFile({ ...file, content: newFileContent });
  }, 1000);

  const selectedStep = steps.find((step) => step.id === selectedStepId);
  const selectedSocket = selectedStep?.outputs.find(
    (socket) => socket.id === selectedSocketId,
  );
  if (!selectedStep || !selectedSocket) return null;

  const file = selectedSocket.data as File;

  return (
    <FileEditor
      key={selectedStepId + file.name}
      fileName={file.name}
      fileContent={file.content}
      onUpdateFileName={updateFileName}
      onUpdateFileContent={updateFileContent}
      onDeselectFile={() => dispatch({ type: GraphActionType.DeselectSocket })}
      editableName={edit && selectedStepId !== 0}
      editableContent={edit && selectedStepId !== 0}
    />
  );
};

export default GraphFileEditor;
