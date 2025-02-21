import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { createFile } from "@/api";
import FormSection from "@/components/form/form-section";
import FileInputButton from "@/components/form/inputs/file-input-button";
import { FileTree } from "@/components/ui/file-tree";
import FileEditor from "@/features/problems/components/tasks/file-editor";
import { cleanFilePath, convertFilesToFileTree } from "@/lib/files";
import { FileT, ProgTaskFormT } from "@/lib/schema/prog-task-form";
import { uuid } from "@/lib/utils";

const shouldPathBeMoved = (filePath: string, pathToMove: string) => {
  if (!filePath.startsWith(pathToMove)) {
    return false;
  }
  if (filePath === pathToMove) {
    return true;
  }
  const remainingPath = filePath.slice(pathToMove.length);
  if (pathToMove[pathToMove.length - 1] !== "/" && remainingPath[0] !== "/") {
    return false;
  }
  return true;
};

const movePath = (filePath: string, oldPath: string, newPath: string) => {
  if (!shouldPathBeMoved(filePath, oldPath)) {
    return filePath;
  }
  return cleanFilePath(filePath.replace(oldPath, newPath));
};

const FileInputSection = () => {
  const form = useFormContext<ProgTaskFormT>();

  const handleUploadFile = (file: File) => {
    const filePath = cleanFilePath(file.webkitRelativePath || file.name);
    // If file is a text file, extract text content to File format for socket.
    if (file.type.startsWith("text") || file.type === "" || file.type === "application/json") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileContent = (e.target?.result as string).trim();
        form.setValue(
          "files",
          form.getValues("files").concat({ id: uuid(), path: filePath, content: fileContent, trusted: true }),
        );
      };
      reader.readAsText(file);
    } else {
      // Otherwise, upload file to endpoint. Save minio key.
      createFile({ body: { file } }).then((response) => {
        form.setValue(
          "files",
          form
            .getValues("files")
            .concat({ id: uuid(), path: filePath, content: "", trusted: true, on_minio: true, key: response.data }),
        );
      });
    }
  };

  const handleUploadFiles = (files: FileList | null) => {
    if (!files) {
      return;
    }
    for (const file of files) {
      handleUploadFile(file);
    }
  };

  const [selectedFile, setSelectedFile] = useState<FileT | null>();

  const files = form.watch("files").map((file) => ({
    id: file.id,
    name: file.path.split("/").pop()!,
    path: file.path,
    content: file.content,
    isBinary: !!file.on_minio,
    downloadUrl: "",
    onClick: () => {
      setSelectedFile(file);
    },
    highlighted: file.path === (selectedFile?.path || ""),
  }));

  const handleFileContentUpdate = (newContent: string) => {
    if (!selectedFile) {
      return;
    }
    form.setValue(
      "files",
      form
        .getValues("files")
        .map((file) => (file.path === selectedFile.path ? { ...file, content: newContent } : file)),
    );
  };

  const handlePathChange = (oldPath: string, newPath: string) => {
    // TODO: Check if newPath is valid
    if (oldPath.endsWith("/") && !newPath.endsWith("/")) {
      return;
    }
    if (oldPath.endsWith("/") && newPath.endsWith("/") && newPath.startsWith(oldPath)) {
      return;
    }
    form.setValue(
      "files",
      form.getValues("files").map((file) => {
        return { ...file, path: movePath(file.path, oldPath, newPath) };
      }),
    );
    if (selectedFile && selectedFile.path.startsWith(oldPath)) {
      const newSelectedFilePath = cleanFilePath(selectedFile.path.replace(oldPath, newPath));
      setSelectedFile({ ...selectedFile, path: newSelectedFilePath });
    }
  };

  const handlePathDelete = (path: string) => {
    const isFileDeleted = (filePath: string) => {
      return filePath === path || (path.endsWith("/") && filePath.startsWith(path));
    };
    form.setValue(
      "files",
      form.getValues("files").filter((file) => !isFileDeleted(file.path)),
    );
    if (selectedFile && isFileDeleted(selectedFile.path)) {
      setSelectedFile(null);
    }
  };

  const handleFileAdd = () => {
    // Generate a unique filename.
    let fileName = "file.py";
    let i = 1;
    while (form.getValues("files").some((file) => file.path === fileName)) {
      fileName = `file${i}.py`;
      i++;
    }
    form.setValue("files", form.getValues("files").concat({ id: uuid(), path: fileName, content: "", trusted: true }));
  };

  const handleFolderAdd = () => {
    // Generate a unique folder name.
    let folderName = "folder/";
    let i = 1;
    while (form.getValues("files").some((file) => file.path.startsWith(folderName))) {
      folderName = `folder${i}/`;
      i++;
    }
    form.setValue(
      "files",
      form.getValues("files").concat({ id: uuid(), path: folderName, content: "", trusted: true }),
    );
  };

  return (
    <FormSection title="Files">
      <div className="flex gap-2">
        <FileInputButton multiple buttonText="Upload File" onFileChange={handleUploadFiles} />
        <FileInputButton buttonText="Upload Folder" webkitdirectory="true" onFileChange={handleUploadFiles} />
      </div>
      <div className="flex !h-[500px] gap-0">
        <FileTree
          files={convertFilesToFileTree(files)}
          onPathChange={handlePathChange}
          onFileAdd={handleFileAdd}
          onFolderAdd={handleFolderAdd}
          onPathDelete={handlePathDelete}
        />
        {selectedFile && !selectedFile.on_minio && (
          <FileEditor
            key={selectedFile.id + selectedFile.path}
            fileName={selectedFile.path.split("/").pop()!}
            fileContent={selectedFile.content}
            onUpdateFileContent={handleFileContentUpdate}
            onDeselectFile={() => setSelectedFile(null)}
            editableContent
            editableName={false}
          />
        )}
      </div>
    </FormSection>
  );
};

export default FileInputSection;
