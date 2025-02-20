import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { createFile } from "@/api";
import FormSection from "@/components/form/form-section";
import FileInputButton from "@/components/form/inputs/file-input-button";
import { FileTree } from "@/components/ui/file-tree";
import FileEditor from "@/features/problems/components/tasks/file-editor";
// import { useToast } from "@/hooks/use-toast";
import { convertFilesToFileTree } from "@/lib/files";
import { FileT, ProgTaskFormT } from "@/lib/schema/prog-task-form";

const FileInputSection = () => {
  const form = useFormContext<ProgTaskFormT>();
  // const toast = useToast();

  const handleUploadFile = (file: File) => {
    const filePath = file.webkitRelativePath || file.name;
    // If file is a text file, extract text content to File format for socket.
    if (file.type.startsWith("text") || file.type === "" || file.type === "application/json") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileContent = (e.target?.result as string).trim();
        form.setValue("files", form.getValues("files").concat({ path: filePath, content: fileContent, trusted: true }));
      };
      reader.readAsText(file);
    } else {
      // Otherwise, upload file to endpoint. Save minio key.
      createFile({ body: { file } }).then((response) => {
        form.setValue(
          "files",
          form
            .getValues("files")
            .concat({ path: filePath, content: "", trusted: true, on_minio: true, key: response.data }),
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
    form.setValue(
      "files",
      form
        .getValues("files")
        .map((file) => (file.path.startsWith(oldPath) ? { ...file, path: file.path.replace(oldPath, newPath) } : file)),
    );
    if (selectedFile && selectedFile.path.startsWith(oldPath)) {
      const newSelectedFilePath = selectedFile.path.replace(oldPath, newPath);
      setSelectedFile({ ...selectedFile, path: newSelectedFilePath });
    }
  };

  return (
    <FormSection title="Files">
      <div className="flex gap-2">
        <FileInputButton multiple buttonText="Upload File" onFileChange={handleUploadFiles} />
        <FileInputButton buttonText="Upload Folder" webkitdirectory="true" onFileChange={handleUploadFiles} />
      </div>
      <div className="flex !h-[500px] gap-0">
        <FileTree files={convertFilesToFileTree(files)} onPathChange={handlePathChange} />
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
