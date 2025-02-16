import "@xyflow/react/dist/style.css";

import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect } from "react";
import { useImmerReducer } from "use-immer";

import { GraphEdgeStr as GraphEdge, InputStep } from "@/api";

import {
  GraphAction,
  GraphActionType,
  GraphContext,
  GraphDispatchContext,
  graphReducer,
} from "./graph-context";
import GraphEditor from "./graph-editor";
import { Step } from "./types";

type NodeGraphProps = {
  id: string;
  sharedUserInput?: InputStep;
  steps: Step[];
  edges: GraphEdge[];
  edit: boolean;
  onChange?: (action: GraphAction) => void;
};

const NodeGraph: React.FC<NodeGraphProps> = ({
  id,
  sharedUserInput,
  steps,
  edges,
  edit,
  onChange,
}) => {
  const [graph, dispatch] = useImmerReducer(graphReducer, {
    id,
    steps,
    edges,
    selectedSocketId: null,
    selectedStepId: null,
    edit,
  });
  useEffect(() => {
    if (!sharedUserInput) return;
    dispatch({
      type: GraphActionType.UpdateUserInputStep,
      payload: { step: sharedUserInput },
    });
  }, [sharedUserInput, dispatch]);

  const wrappedDispatch = useCallback(
    (action: GraphAction) => {
      dispatch(action);
      if (onChange) {
        onChange(action);
      }
    },
    [dispatch, onChange],
  );

  return (
    <ReactFlowProvider>
      <GraphContext.Provider value={graph}>
        <GraphDispatchContext.Provider value={wrappedDispatch}>
          <GraphEditor graphId={id} className="h-[60vh]" />
        </GraphDispatchContext.Provider>
      </GraphContext.Provider>
    </ReactFlowProvider>
  );
};

export default NodeGraph;
