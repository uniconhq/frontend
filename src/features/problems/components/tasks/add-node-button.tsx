import { PlusIcon } from "lucide-react";
import React, { useContext, useState } from "react";

import { StepType } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createDefaultStep } from "@/lib/compute-graph";

import { GraphActionType, GraphDispatchContext } from "./graph-context";

const stepTypesToLabel: Record<StepType, string> = {
  PY_RUN_FUNCTION_STEP: "PyRunFunctionStep",
  OBJECT_ACCESS_STEP: "ObjectAccessStep",
  INPUT_STEP: "InputStep",
  OUTPUT_STEP: "OutputStep",
  LOOP_STEP: "LoopStep",
  IF_ELSE_STEP: "IfElseStep",
  STRING_MATCH_STEP: "StringMatchStep",
};

const AddNodeButton: React.FC = () => {
  const dispatch = useContext(GraphDispatchContext)!;
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={"outline"} type="button" onClick={() => setOpen(true)}>
          <PlusIcon />
          Add node
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col">
          {Object.entries(stepTypesToLabel).map(([stepType, label]) => (
            <Button
              key={`${stepType}.${label}`}
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                dispatch({
                  type: GraphActionType.AddStep,
                  payload: { step: createDefaultStep(stepType as StepType) },
                });
                setOpen(false);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AddNodeButton;
