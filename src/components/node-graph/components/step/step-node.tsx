import { useUpdateNodeInternals } from "@xyflow/react";
import { Plus, Trash } from "lucide-react";
import { useCallback, useContext, useEffect } from "react";
import { GoDotFill } from "react-icons/go";

import { StepSocket } from "@/api";
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
import { cn } from "@/lib/utils";

import { NodeSlot, NodeSlotGroup } from "../node-slot";
import StepMetadata from "./metadata/step-metadata";

export function StepNode({ data }: { data: Step }) {
  const { edit } = useContext(GraphContext)!;
  const dispatch = useContext(GraphDispatchContext)!;

  const updateNodeInternals = useUpdateNodeInternals();

  const isStepEditable = "is_user" in data ? !data.is_user : true;
  const showEditElements = edit && isStepEditable;

  // We are programmatically updating the internal state of the node (e.g. adding more handles)
  // as such we will need to sync it with ReactFlow
  // Reference: https://reactflow.dev/learn/troubleshooting#008
  useEffect(() => updateNodeInternals(data.id), [data]);

  const handleEditSocketLabel =
    (socketId: string) => (newSocketLabel: string) => {
      dispatch({
        type: GraphActionType.UpdateSocketLabel,
        payload: { stepId: data.id, socketId, newSocketLabel },
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
    () =>
      dispatch({ type: GraphActionType.DeleteStep, payload: { id: data.id } }),
    [data.id, dispatch],
  );

  const handlesInStepMetadata = ["OUTPUT_STEP", "INPUT_STEP"].includes(
    data.type,
  );

  return (
    <div
      className={cn(
        "flex min-w-52 flex-col rounded bg-[#141414] pb-2 font-mono text-slate-300 outline outline-[0.08rem] outline-neutral-500",
      )}
    >
      {/* Node header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-t py-2 pl-1 pr-4 font-medium uppercase">
          <GoDotFill
            style={{ color: `${StepNodeColorMap[data.type]}` }}
            className="h-5 w-5"
          />
          {StepTypeAliasMap[data.type]}
        </div>
        {showEditElements && (
          <Button
            size={"sm"}
            className="mr-3 h-fit w-fit px-1 py-1"
            variant={"secondary"}
            onClick={deleteStep}
            type="button"
          >
            <Trash className="h-2 w-2" />
          </Button>
        )}
      </div>
      {/* Node metadata */}
      <StepMetadata step={data} />
      {/* Node body */}
      {!handlesInStepMetadata && (
        <div className="text-xs font-light">
          <div className="flex flex-row justify-between">
            <NodeSlotGroup>
              {data.inputs?.map((stepSocket: StepSocket) => (
                <NodeSlot
                  key={stepSocket.id}
                  socket={stepSocket}
                  type="target"
                  edit={edit}
                  onEditSocketLabel={handleEditSocketLabel(stepSocket.id)}
                  onDeleteSocket={deleteSocket(stepSocket.id)}
                />
              ))}
              {showEditElements && (
                <Button
                  size={"sm"}
                  className="ml-3 h-fit w-fit px-1 py-1"
                  variant={"secondary"}
                  onClick={addSocket(SocketDir.Input)}
                  type="button"
                >
                  <Plus className="h-2 w-2" />
                </Button>
              )}
            </NodeSlotGroup>
            <NodeSlotGroup>
              {data.outputs?.map((stepSocket: StepSocket) => (
                <NodeSlot
                  key={stepSocket.id}
                  socket={stepSocket}
                  type="source"
                  edit={edit}
                  onEditSocketLabel={handleEditSocketLabel(stepSocket.id)}
                  onDeleteSocket={deleteSocket(stepSocket.id)}
                />
              ))}
              {showEditElements && (
                <Button
                  size={"sm"}
                  className="mr-3 h-fit w-fit self-end px-1 py-1"
                  variant={"secondary"}
                  onClick={addSocket(SocketDir.Output)}
                  type="button"
                >
                  <Plus className="h-2 w-2" />
                </Button>
              )}
            </NodeSlotGroup>
          </div>
        </div>
      )}
    </div>
  );
}
