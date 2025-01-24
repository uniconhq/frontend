import { useContext } from "react";

import { ObjectAccessStep } from "@/api";
import {
  GraphActionType,
  GraphContext,
  GraphDispatchContext,
} from "@/features/problems/components/tasks/graph-context";

import NodeInput from "../node-input";

type OwnProps = {
  step: ObjectAccessStep;
};

const ObjectAccessMetadata: React.FC<OwnProps> = ({ step }) => {
  const { isEditing } = useContext(GraphContext)!;
  const dispatch = useContext(GraphDispatchContext)!;

  return (
    <div>
      key: "
      {isEditing ? (
        <NodeInput
          value={step.key}
          onChange={(newKey) =>
            dispatch({
              type: GraphActionType.UpdateStepMetadata,
              payload: {
                stepId: step.id,
                stepMetadata: { key: newKey },
              },
            })
          }
        />
      ) : (
        <span>{step.key}</span>
      )}
      "
    </div>
  );
};

export default ObjectAccessMetadata;
