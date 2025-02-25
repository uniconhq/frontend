import { Upload } from "lucide-react";
import React, { useRef } from "react";

import { Button } from "@/components/ui/button";

type OwnProps = {
  onFileChange: (files: FileList | null) => void;
  buttonText: string;
  buttonSize?: "default" | "sm" | "lg" | "icon";
  className?: string;
  iconClassName?: string;
};

const FileInputButton: React.FC<React.HTMLProps<HTMLInputElement> & OwnProps & { webkitdirectory?: string }> = ({
  onFileChange,
  buttonText,
  buttonSize,
  className,
  iconClassName,
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
        size={buttonSize ?? "sm"}
        className={className ?? "mt-3 h-fit w-fit px-1 py-1"}
        variant={"secondary"}
        onClick={onBtnClick}
        type="button"
      >
        <Upload className={iconClassName ?? "h-2 w-2"} />
        {buttonText}
      </Button>
    </div>
  );
};

export default FileInputButton;
