import { InputStep, ObjectAccessStep, OutputStep, PyRunFunctionStep } from "@/api";
import InputMetadata from "@/components/node-graph/components/step/metadata/input-metadata";
import ObjectAccessMetadata from "@/components/node-graph/components/step/metadata/object-access-metadata";
import OutputMetadata from "@/components/node-graph/components/step/metadata/output-metadata";
import PyRunMetadata from "@/components/node-graph/components/step/metadata/py-run-metadata";
import { Step } from "@/features/problems/components/tasks/types";

type OwnProps = {
  step: Step;
  editable: boolean;
};

const StepMetadata: React.FC<OwnProps> = ({ step, editable }) => {
  switch (step.type) {
    case "PY_RUN_FUNCTION_STEP":
      return <PyRunMetadata step={step as PyRunFunctionStep} editable={editable} />;
    case "OBJECT_ACCESS_STEP":
      return <ObjectAccessMetadata step={step as ObjectAccessStep} editable={editable} />;
    case "OUTPUT_STEP":
      return <OutputMetadata step={step as OutputStep} editable={editable} />;
    case "INPUT_STEP":
      return <InputMetadata step={step as InputStep} editable={editable} />;
    default:
      return null;
  }
};

export default StepMetadata;
