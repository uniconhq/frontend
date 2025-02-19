import { Plus } from "lucide-react";
import React, { useRef } from "react";

import { Button } from "@/components/ui/button";

type OwnProps = {
  onFileChange: (files: FileList | null) => void;
  buttonText: string;
};

const FileInputButton: React.FC<OwnProps & React.HTMLProps<HTMLInputElement> & { webkitdirectory?: string }> = ({
  onFileChange,
  buttonText,
  ...fileInputProps
}) => {
  const inputFileRef = useRef<HTMLInputElement | null>(null);

  const onBtnClick = () => {
    if (inputFileRef.current) {
      inputFileRef.current.click();
    }
  };

  return (
    <div>
      <input
        className="hidden"
        {...fileInputProps}
        type="file"
        ref={inputFileRef}
        onChange={(e) => onFileChange(e.target.files)}
      />
      <Button
        size={"sm"}
        className="mt-3 h-fit w-fit px-1 py-1"
        variant={"secondary"}
        onClick={onBtnClick}
        type="button"
      >
        <Plus className="h-2 w-2" />
        {buttonText}
      </Button>
    </div>
  );
};

export default FileInputButton;
