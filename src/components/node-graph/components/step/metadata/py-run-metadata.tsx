import { useContext, useState } from "react";

import { PyRunFunctionStep } from "@/api";
import { Checkbox } from "@/components/ui/checkbox";
import {
  GraphContext,
  GraphDispatchContext,
} from "@/features/problems/components/tasks/graph-context";

import NodeInput from "../node-input";

type OwnProps = {
  step: PyRunFunctionStep;
};

const PyRunMetadata: React.FC<OwnProps> = ({ step }) => {
  const { isEditing } = useContext(GraphContext)!;
  const dispatch = useContext(GraphDispatchContext)!;

  const [functionIdentifier, setFunctionIdentifier] = useState(
    step.function_identifier,
  );

  const [allowError, setAllowError] = useState(step.allow_error || false);

  const onChange = (newFunctionIdentifier: string, allow_error: boolean) => {
    dispatch({
      type: "UPDATE_STEP_EXCLUDING_SOCKETS",
      stepId: step.id,
      step: {
        ...step,
        function_identifier: newFunctionIdentifier,
        allow_error: allow_error,
      },
    });
  };

  return isEditing ? (
    <>
      <div>
        function_identifier: "
        <NodeInput
          value={functionIdentifier}
          onChange={(newFunctionIdentifier) => {
            setFunctionIdentifier(newFunctionIdentifier);
            onChange(newFunctionIdentifier, allowError);
          }}
        />
        "
      </div>
      <div className="flex items-center gap-2">
        allow_error:
        <Checkbox
          className="inline bg-transparent text-xs"
          checked={allowError}
          onCheckedChange={() => setAllowError(!allowError)}
        />
      </div>
    </>
  ) : (
    <div className="flex flex-col items-center gap-1">
      <div>{(step as PyRunFunctionStep).function_identifier}(...)</div>
      <div>
        allow_error: {JSON.stringify((step as PyRunFunctionStep).allow_error)}
      </div>
    </div>
  );
};

export default PyRunMetadata;
