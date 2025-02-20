import { Editor } from "@monaco-editor/react";
import { X } from "lucide-react";
import { useState } from "react";

import NodeInput from "@/components/node-graph/components/step/node-input";
import { Button } from "@/components/ui/button";

type OwnProps = {
  fileName: string;
  fileContent: string;
  onUpdateFileName?: (newFileName: string) => void;
  onUpdateFileContent?: (newFileContent: string) => void;
  onDeselectFile?: () => void;
  editableName: boolean;
  editableContent: boolean;
};

// Assumes debouncing is handled by the parent component onUpdateFileName and onUpdateFileContent
const FileEditor: React.FC<OwnProps> = ({
  fileName,
  fileContent,
  onUpdateFileName,
  onUpdateFileContent,
  onDeselectFile,
  editableName,
  editableContent,
}) => {
  const [displayFileName, setDisplayFilename] = useState(fileName);
  const [displayFileContent, setDisplayFileValue] = useState(fileContent);

  const updateFileName = (newValue: string) => {
    setDisplayFilename(newValue);
    if (onUpdateFileName) onUpdateFileName(newValue);
  };

  const updateFileContent = (newValue: string | undefined) => {
    if (newValue === undefined) {
      return;
    }
    setDisplayFileValue(newValue);
    if (onUpdateFileContent) onUpdateFileContent(newValue);
  };

  return (
    <div className="flex h-full grow flex-col">
      {/* file tab */}
      <div className="flex w-fit items-center gap-2 border-b border-purple-200 py-1">
        {editableName ? (
          <NodeInput key={displayFileName} value={displayFileName} onChange={updateFileName} />
        ) : (
          <span className="px-1 text-xs">{displayFileName}</span>
        )}
        {onDeselectFile && (
          <Button className="h-fit p-1" variant={"ghost"} onClick={onDeselectFile}>
            <X />
          </Button>
        )}
      </div>
      <Editor
        className="grow"
        theme="vs-dark"
        defaultLanguage="python"
        language={fileName.split(".").pop()}
        options={{
          padding: { top: 5 },
          minimap: { enabled: false },
          readOnly: !editableContent,
        }}
        value={displayFileContent}
        onChange={updateFileContent}
      />
    </div>
  );
};

export default FileEditor;
