import "@xyflow/react/dist/style.css";

import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect } from "react";
import { useImmerReducer } from "use-immer";

import { File as ApiFile, GraphEdgeStr as GraphEdge, InputStep } from "@/api";

import { GraphAction, GraphActionType, GraphContext, GraphDispatchContext, graphReducer } from "./graph-context";
import GraphEditor from "./graph-editor";
import { Step } from "./types";

type NodeGraphProps = {
  id: string;
  sharedUserInput?: InputStep;
  steps: Step[];
  edges: GraphEdge[];
  edit: boolean;
  onChange?: (action: GraphAction) => void;
  taskFiles: ApiFile[];

  // For testcase settings menu
  settings?: { name?: string; isPrivate?: boolean };
  onDelete?: () => void;
  onSettingsChange?: (change: { name?: string; isPrivate?: boolean }) => void;
  onDuplicateTestcase?: () => void;
};

const NodeGraph: React.FC<NodeGraphProps> = ({
  id,
  sharedUserInput,
  steps,
  edges,
  edit,
  onChange,
  taskFiles,
  settings,
  onDelete,
  onSettingsChange,
  onDuplicateTestcase,
}) => {
  const [graph, dispatch] = useImmerReducer(graphReducer, {
    id,
    steps,
    edges,
    selectedSocketId: null,
    selectedStepId: null,
    edit,
    files: taskFiles,
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
      if (onChange) onChange(action);
    },
    [dispatch, onChange],
  );

  return (
    <ReactFlowProvider>
      <GraphContext.Provider value={{ ...graph, files: taskFiles }}>
        <GraphDispatchContext.Provider value={wrappedDispatch}>
          <GraphEditor
            graphId={id}
            className="h-[60vh]"
            settings={settings}
            onDelete={onDelete}
            onSettingsChange={onSettingsChange}
            onDuplicateTestcase={onDuplicateTestcase}
          />
        </GraphDispatchContext.Provider>
      </GraphContext.Provider>
    </ReactFlowProvider>
  );
};

export default NodeGraph;
