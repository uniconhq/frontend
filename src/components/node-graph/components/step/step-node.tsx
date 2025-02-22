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
  const updateNodeInternals = useUpdateNodeInternals();

  const { edit: inEditMode } = useContext(GraphContext)!;
  const dispatch = useContext(GraphDispatchContext)!;

  const editable = inEditMode && ("is_user" in data ? !data.is_user : true);

  // `PyRunFunctionStep` is a special case where we don't allow the same level of socket editing
  // as the other steps. This is because the step has its own mechanism to determine the number of
  // inputs and outputs, along with the labels for each socket.
  const _isPyRunFunc = data.type === "PY_RUN_FUNCTION_STEP";
  const editableLabel = editable && !_isPyRunFunc;
  const canAddSockets = editable && !_isPyRunFunc;
  const canDeleteSockets = editable && !_isPyRunFunc;

  // `Input` and `Output` steps have the sockets and handles in their custom metadata
  // components, so we there's no need to provide them with default sockets and handles
  // like the other steps
  const socketsInMetadata = ["OUTPUT_STEP", "INPUT_STEP"].includes(data.type);

  // We are programmatically updating the internal state of the node (e.g. adding more handles)
  // as such we will need to sync it with ReactFlow
  // Reference: https://reactflow.dev/learn/troubleshooting#008
  useEffect(() => updateNodeInternals(data.id), [data]);

  const onEditLabel = (socketId: string) => (newSocketLabel: string) => {
    dispatch({
      type: GraphActionType.UpdateSocketLabel,
      payload: { stepId: data.id, socketId, newSocketLabel },
    });
  };

  const onEditData = (socketId: string) => (newSocketData: string | number | boolean) => {
    dispatch({
      type: GraphActionType.UpdateSocketData,
      payload: { stepId: data.id, socketId, data: newSocketData },
    });
  };

  const onDeleteSocket = (socketId: string) => () => {
    dispatch({
      type: GraphActionType.DeleteSocket,
      payload: { stepId: data.id, socketId },
    });
  };

  const addSocket = useCallback(
    (socketDir: SocketDir) => () => {
      dispatch({
        type: GraphActionType.AddSocket,
        payload: { stepId: data.id, socketDir, socket: createSocket("DATA", "") },
      });
    },
    [data.id, dispatch],
  );

  const deleteStep = useCallback(
    () => dispatch({ type: GraphActionType.DeleteStep, payload: { id: data.id } }),
    [data.id, dispatch],
  );

  return (
    <div className="rounded-b-lg bg-[#141414]">
      <NodeHeader type={data.type} edit={inEditMode} deleteStep={deleteStep} />
      <div className="flex min-w-52 flex-col gap-2 rounded-b-lg border-x-2 border-b-2 py-3">
        <StepMetadata step={data} editable={editable} />
        {!socketsInMetadata && (
          <div className="font-mono text-xs">
            <div className="flex flex-row justify-between gap-8">
              <NodeSlotGroup>
                {[...(data.inputs ?? [])]
                  ?.sort(orderSockets)
                  .map((stepSocket: StepSocket) => (
                    <NodeSlot
                      key={stepSocket.id}
                      type="target"
                      socket={stepSocket}
                      onEditData={inEditMode ? onEditData(stepSocket.id) : undefined}
                      onEditLabel={editableLabel ? onEditLabel(stepSocket.id) : undefined}
                      onDelete={canDeleteSockets ? onDeleteSocket(stepSocket.id) : undefined}
                    />
                  ))}
                {canAddSockets && (
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
                      type="source"
                      socket={stepSocket}
                      onEditData={inEditMode ? onEditData(stepSocket.id) : undefined}
                      onEditLabel={editableLabel ? onEditLabel(stepSocket.id) : undefined}
                      onDelete={canDeleteSockets ? onDeleteSocket(stepSocket.id) : undefined}
                    />
                  ))}
                {canAddSockets && (
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
