import { KeyRoundIcon } from "lucide-react";
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
  const { edit } = useContext(GraphContext)!;
  const dispatch = useContext(GraphDispatchContext)!;

  return (
    <div className="border-b-2 border-zinc-800 px-2 pb-3 pt-2">
      {edit ? (
        <div className="flex items-center gap-2">
          <label className="text-nowrap font-mono text-sm text-zinc-400">Key:</label>
          <NodeInput
            className={["text-sm", "font-mono"]}
            value={step.key}
            onChange={(newKey) =>
              dispatch({
                type: GraphActionType.UpdateStepMetadata,
                payload: {
                  id: step.id,
                  stepMetadata: { key: newKey },
                },
              })
            }
          />
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <KeyRoundIcon size={20} className="text-zinc-400" />
          <div className="flex flex-col">
            <span className="text-xs text-zinc-400">Key</span>
            <span className="font-mono text-sm font-medium text-white">{step.key}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ObjectAccessMetadata;
