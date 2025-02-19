import { ClassValue } from "clsx";

import { cn } from "@/lib/utils";

type OwnProps = {
  className?: ClassValue[];
  value: string;
  onChange: (newValue: string) => void;
};

const NodeInput: React.FC<OwnProps> = ({ className = [], value, onChange }) => {
  return (
    <input
      type="text"
      className={cn(
        "nodrag inline max-w-fit rounded-sm border border-gray-500/50 bg-transparent p-1 font-mono text-xs",
        ...className,
      )}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      size={value.length}
    />
  );
};

export default NodeInput;
