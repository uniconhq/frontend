import { InputStep, ObjectAccessStep, OutputStep, PyRunFunctionStep, StepType } from "@/api";
import { Step } from "@/features/problems/components/tasks/types";

import InputMetadata from "./input-metadata";
import ObjectAccessMetadata from "./object-access-metadata";
import OutputMetadata from "./output-metadata";
import PyRunMetadata from "./py-run-metadata";

const STEP_TYPES_WITH_METADATA: StepType[] = [
  "PY_RUN_FUNCTION_STEP",
  "OBJECT_ACCESS_STEP",
  "OUTPUT_STEP",
  "INPUT_STEP",
];

type OwnProps = {
  step: Step;
};

const StepMetadata: React.FC<OwnProps> = ({ step }) => {
  if (!STEP_TYPES_WITH_METADATA.includes(step.type)) {
    return null;
  }
  return (
    <div className="mx-2 pb-4 font-mono text-sm">
      {step.type === "PY_RUN_FUNCTION_STEP" && <PyRunMetadata step={step as PyRunFunctionStep} />}
      {step.type === "OBJECT_ACCESS_STEP" && <ObjectAccessMetadata step={step as ObjectAccessStep} />}
      {step.type === "OUTPUT_STEP" && <OutputMetadata step={step as OutputStep} />}
      {step.type === "INPUT_STEP" && <InputMetadata step={step as InputStep} />}
    </div>
  );
};

export default StepMetadata;
