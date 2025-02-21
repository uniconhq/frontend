import { useUpdateNodeInternals } from "@xyflow/react";
import {
  CircleDotIcon,
  EqualIcon,
  EyeIcon,
  InfinityIcon,
  PlayIcon,
  PlusIcon,
  SplitIcon,
  TextCursorInputIcon,
  TrashIcon,
} from "lucide-react";
import { useCallback, useContext, useEffect } from "react";

import { StepSocket, StepType } from "@/api";
import { NodeSlot, NodeSlotGroup } from "@/components/node-graph/components/node-slot";
import StepMetadata from "@/components/node-graph/components/step/metadata/step-metadata";
import { Button } from "@/components/ui/button";
import {
  GraphActionType,
  GraphContext,
  GraphDispatchContext,
  SocketDir,
} from "@/features/problems/components/tasks/graph-context";
import { Step } from "@/features/problems/components/tasks/types";
import { StepNodeColorMap, StepTypeAliasMap } from "@/lib/colors";
import { createSocket } from "@/lib/compute-graph";

const STEP_TYPE_ICONS: Record<StepType, JSX.Element> = {
  PY_RUN_FUNCTION_STEP: <PlayIcon />,
  OBJECT_ACCESS_STEP: <CircleDotIcon />,
  OUTPUT_STEP: <EyeIcon />,
  INPUT_STEP: <TextCursorInputIcon />,
  STRING_MATCH_STEP: <EqualIcon />,
  LOOP_STEP: <InfinityIcon />,
  IF_ELSE_STEP: <SplitIcon />,
};

const NodeHeader = ({ type, edit, deleteStep }: { type: StepType; edit: boolean; deleteStep: () => void }) => {
  return (
    <div
      className="w-content flex items-center justify-between gap-10 rounded-t border-2 p-2"
      style={{ borderColor: StepNodeColorMap[type] }}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center" style={{ color: StepNodeColorMap[type] }}>
          {STEP_TYPE_ICONS[type]}
        </div>
        <span className="text-sm font-medium capitalize">{StepTypeAliasMap[type]}</span>
      </div>
      {edit && (
        <Button className="h-fit w-fit bg-transparent px-2" variant="secondary" onClick={deleteStep} type="button">
          <TrashIcon />
        </Button>
      )}
    </div>
  );
};

const orderSockets = (s1: StepSocket, s2: StepSocket) => {
  // Control sockets should always be in front of data sockets
  if (s1.type === "CONTROL" && s2.type === "DATA") return -1;
  if (s1.type === "DATA" && s2.type === "CONTROL") return 1;
  return 0;
};

export function StepNode({ data }: { data: Step }) {
  const { edit } = useContext(GraphContext)!;
  const dispatch = useContext(GraphDispatchContext)!;

  const updateNodeInternals = useUpdateNodeInternals();

  const isStepEditable = "is_user" in data ? !data.is_user : true;
  const showEditElements = edit && isStepEditable;
  const allowEditSockets = showEditElements && data.type !== "PY_RUN_FUNCTION_STEP";

  // We are programmatically updating the internal state of the node (e.g. adding more handles)
  // as such we will need to sync it with ReactFlow
  // Reference: https://reactflow.dev/learn/troubleshooting#008
  useEffect(() => updateNodeInternals(data.id), [data]);

  const handleEditSocketLabel = (socketId: string) => (newSocketLabel: string) => {
    dispatch({
      type: GraphActionType.UpdateSocketLabel,
      payload: { stepId: data.id, socketId, newSocketLabel },
    });
  };

  const handleEditSocketData = (socketId: string) => (newSocketData: string | number | boolean) => {
    dispatch({
      type: GraphActionType.UpdateSocketData,
      payload: { stepId: data.id, socketId, data: newSocketData },
    });
  };

  const addSocket = useCallback(
    (socketDir: SocketDir) => () => {
      dispatch({
        type: GraphActionType.AddSocket,
        payload: {
          stepId: data.id,
          socketDir,
          socket: createSocket("DATA", ""),
        },
      });
    },
    [data.id, dispatch],
  );

  const deleteSocket = (socketId: string) => () => {
    dispatch({
      type: GraphActionType.DeleteSocket,
      payload: { stepId: data.id, socketId },
    });
  };

  const deleteStep = useCallback(
    () => dispatch({ type: GraphActionType.DeleteStep, payload: { id: data.id } }),
    [data.id, dispatch],
  );

  const handlesInStepMetadata = ["OUTPUT_STEP", "INPUT_STEP"].includes(data.type);

  return (
    <div className="rounded-b-lg bg-[#141414]">
      {/* Node header */}
      <NodeHeader type={data.type} edit={showEditElements} deleteStep={deleteStep} />
      <div className="flex min-w-52 flex-col gap-2 rounded-b-lg border-x-2 border-b-2 pb-2">
        {/* Node metadata */}
        <StepMetadata step={data} />
        {/* Node body */}
        {!handlesInStepMetadata && (
          <div className="pt-1 font-mono text-xs">
            <div className="flex flex-row justify-between gap-4">
              <NodeSlotGroup>
                {[...(data.inputs ?? [])]
                  ?.sort(orderSockets)
                  .map((stepSocket: StepSocket) => (
                    <NodeSlot
                      key={stepSocket.id}
                      socket={stepSocket}
                      type="target"
                      edit={showEditElements}
                      allowEditSockets={allowEditSockets}
                      onEditSocketData={handleEditSocketData(stepSocket.id)}
                      onEditSocketLabel={handleEditSocketLabel(stepSocket.id)}
                      onDeleteSocket={deleteSocket(stepSocket.id)}
                    />
                  ))}
                {showEditElements && allowEditSockets && (
                  <Button
                    size={"sm"}
                    className="ml-2 h-fit w-fit px-1 py-1"
                    variant="secondary"
                    onClick={addSocket(SocketDir.Input)}
                    type="button"
                  >
                    <PlusIcon />
                  </Button>
                )}
              </NodeSlotGroup>
              <NodeSlotGroup>
                {[...(data.outputs ?? [])]
                  ?.sort(orderSockets)
                  .map((stepSocket: StepSocket) => (
                    <NodeSlot
                      key={stepSocket.id}
                      socket={stepSocket}
                      type="source"
                      edit={showEditElements}
                      allowEditSockets={allowEditSockets}
                      onEditSocketLabel={handleEditSocketLabel(stepSocket.id)}
                      onDeleteSocket={deleteSocket(stepSocket.id)}
                    />
                  ))}
                {showEditElements && allowEditSockets && (
                  <Button
                    size={"sm"}
                    className="mr-2 h-fit w-fit self-end px-1 py-1"
                    variant="secondary"
                    onClick={addSocket(SocketDir.Output)}
                    type="button"
                  >
                    <PlusIcon />
                  </Button>
                )}
              </NodeSlotGroup>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
