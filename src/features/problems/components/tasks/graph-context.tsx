import { createContext, Dispatch } from "react";
import { ImmerReducer } from "use-immer";

import {
  GraphEdgeStr as GraphEdge,
  InputStep,
  ParsedFunction,
  PyRunFunctionSocket,
  PyRunFunctionStep,
  StepSocket,
} from "@/api";
import { Step } from "@/features/problems/components/tasks/types";
import { createSocket } from "@/lib/compute-graph";

export type GraphState = {
  id: string;
  steps: Step[];
  edges: GraphEdge[];
  selectedStepId: string | null;
  selectedSocketId: string | null;
  edit: boolean;
};

export enum GraphActionType {
  // Step/Node actions
  AddStep = "ADD_STEP",
  DeleteStep = "DELETE_STEP",
  UpdateStepMetadata = "UPDATE_STEP_METADATA",
  // Socket actions
  AddSocket = "ADD_SOCKET",
  DeleteSocket = "DELETE_SOCKET",
  UpdateSocketData = "UPDATE_SOCKET_DATA",
  UpdateSocketLabel = "UPDATE_SOCKET_LABEL",
  UpdateSocketMetadata = "UPDATE_SOCKET_METADATA",
  // Edge actions
  AddEdge = "ADD_EDGE",
  DeleteEdge = "DELETE_EDGE",
  // Select/Focus actions
  SelectSocket = "SELECT_SOCKET",
  DeselectSocket = "DESELECT_SOCKET",
  // Special actions
  UpdateUserInputStep = "UPDATE_USER_INPUT_STEP",
  UpdatePyRunFunctionStep = "UPDATE_FUNCTION_IDENTIFIER_STEP",
}

interface BaseGraphAction {
  type: GraphActionType;
  payload?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface AddStepAction extends BaseGraphAction {
  type: GraphActionType.AddStep;
  payload: { step: Step };
}

interface DeleteStepAction extends BaseGraphAction {
  type: GraphActionType.DeleteStep;
  payload: { id: string };
}

interface UpdateStepMetadataAction extends BaseGraphAction {
  type: GraphActionType.UpdateStepMetadata;
  payload: { id: string; stepMetadata: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export enum SocketDir {
  Input = "INPUT",
  Output = "OUTPUT",
}

interface AddSocketAction extends BaseGraphAction {
  type: GraphActionType.AddSocket;
  payload: { stepId: string; socketDir: SocketDir; socket: StepSocket };
}

interface DeleteSocketAction extends BaseGraphAction {
  type: GraphActionType.DeleteSocket;
  payload: { stepId: string; socketId: string };
}

interface UpdateSocketLabelAction extends BaseGraphAction {
  type: GraphActionType.UpdateSocketLabel;
  payload: { stepId: string; socketId: string; newSocketLabel: string };
}

interface UpdateSocketMetadataAction extends BaseGraphAction {
  type: GraphActionType.UpdateSocketMetadata;
  payload: {
    stepId: string;
    socketId: string;
    socketMetadata: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

interface AddEdgeAction extends BaseGraphAction {
  type: GraphActionType.AddEdge;
  payload: {
    id: string;
    from_node_id: string;
    from_socket_id: string;
    to_node_id: string;
    to_socket_id: string;
  };
}

interface DeleteEdgeAction extends BaseGraphAction {
  type: GraphActionType.DeleteEdge;
  payload: { id: string };
}

interface SelectSocketAction extends BaseGraphAction {
  type: GraphActionType.SelectSocket;
  payload: { stepId: string; socketId: string };
}

interface DeselectSocketAction extends BaseGraphAction {
  type: GraphActionType.DeselectSocket;
}

interface DeselectSocketAction extends BaseGraphAction {
  type: GraphActionType.DeselectSocket;
}

interface UpdateUserInputStepAction extends BaseGraphAction {
  type: GraphActionType.UpdateUserInputStep;
  payload: { step: InputStep };
}

interface UpdatePyRunFunctionStepAction extends BaseGraphAction {
  type: GraphActionType.UpdatePyRunFunctionStep;
  payload: {
    stepId: string;
    functionIdentifier: string;
    functionSignature?: ParsedFunction;
    allowError: boolean;
    uuids: string[];
  };
}

export type GraphAction =
  | AddStepAction
  | DeleteStepAction
  | UpdateStepMetadataAction
  | AddSocketAction
  | DeleteSocketAction
  | UpdateSocketLabelAction
  | UpdateSocketMetadataAction
  | AddEdgeAction
  | DeleteEdgeAction
  | SelectSocketAction
  | DeselectSocketAction
  | UpdateUserInputStepAction
  | UpdatePyRunFunctionStepAction;

const updateUserInputStep = (state: GraphState, { payload }: UpdateUserInputStepAction) => {
  const inputSteps = state.steps.filter((node) => node.type === "INPUT_STEP") as InputStep[];
  const userInputStepIdx = inputSteps.findIndex((node) => node.is_user);
  if (userInputStepIdx !== -1) {
    Object.assign(state.steps[userInputStepIdx], {
      outputs: payload.step.outputs,
    });
  }
  return state;
};

const sameFunctionSignature = (a: PyRunFunctionSocket[], b: PyRunFunctionSocket[]) => {
  if (a.length !== b.length) return false;
  return a.every((socket, index) => {
    const other = b[index];
    return (
      socket.type === other.type &&
      socket.label === other.label &&
      socket.arg_metadata?.position === other.arg_metadata?.position &&
      socket.arg_metadata?.arg_name === other.arg_metadata?.arg_name &&
      // In the case where one is null and the other is undefined - consider them the same
      ((!socket.kwarg_name && !other.kwarg_name) || socket.kwarg_name === other.kwarg_name)
    );
  });
};

const updatePyRunFunctionStep = (state: GraphState, { payload }: UpdatePyRunFunctionStepAction) => {
  const stepIndex = state.steps.findIndex((node) => node.id === payload.stepId);
  const step = state.steps[stepIndex] as PyRunFunctionStep;

  const getUuid = (() => {
    let index = 0;
    return () => {
      const uuid = payload.uuids[index];
      if (!uuid) throw new Error("UUIDs are empty");
      index++;
      return uuid;
    };
  })();

  // Detect changes
  const functionIdentifierChanged = step.function_identifier !== payload.functionIdentifier;
  const functionSignatureChanged = payload.functionSignature !== undefined;
  const allowErrorChanged = step.allow_error !== payload.allowError;

  if (functionIdentifierChanged) {
    // 1. Update the identifier.
    state.steps[stepIndex] = {
      ...state.steps[stepIndex],
      function_identifier: payload.functionIdentifier,
    };
  }

  if (functionSignatureChanged && payload.functionSignature) {
    // If args/kwargs have changed, we need to:
    //   1. Replace the input sockets with arguments of the new function signature.
    //   2. Remove all edges and replace args/kwargs connected to the node except the file edge
    // Otherwise, become a no-op.
    const functionArgs: PyRunFunctionSocket[] = payload.functionSignature.args.map((arg, index) => ({
      ...createSocket("DATA", arg.name + (arg.default ? ` (default:${arg.default})` : "")),
      id: getUuid(),
      arg_metadata: {
        position: index,
        arg_name: arg.name,
      },
    }));

    const functionKwargs: PyRunFunctionSocket[] = payload.functionSignature.kwargs.map((kwarg) => ({
      ...createSocket("DATA", kwarg.name + (kwarg.default ? ` = ${kwarg.default}` : "")),
      id: getUuid(),
      kwarg_name: kwarg.name,
    }));

    if (
      !sameFunctionSignature(
        step.inputs.filter((input) => !input.import_as_module && input.type !== "CONTROL"),
        [...functionArgs, ...functionKwargs],
      )
    ) {
      const fileSocket = step.inputs.find((socket) => socket.import_as_module);
      state.edges = state.edges.filter(
        (edge) => edge.to_node_id !== payload.stepId || edge.to_socket_id === fileSocket?.id,
      );

      state.steps[stepIndex] = {
        ...state.steps[stepIndex],
        inputs: [
          { ...createSocket("CONTROL"), id: getUuid() },
          { ...createSocket("DATA", "Module"), id: fileSocket?.id ?? getUuid(), import_as_module: true },
          ...functionArgs,
          ...functionKwargs,
        ],
      };
    }
  }

  if (allowErrorChanged) {
    // If allow error is changed to true, add a new output socket.
    // If allow error is changed to false, remove the output socket and outgoing edges.
    state.steps[stepIndex] = {
      ...state.steps[stepIndex],
      allow_error: payload.allowError,
    };
    if (payload.allowError) {
      (state.steps[stepIndex] as PyRunFunctionStep).outputs.push({
        ...createSocket("DATA", "Error"),
        id: getUuid(),
        handles_error: true,
      });
    } else {
      const errorSocketId = step.outputs.find((socket) => socket.handles_error)?.id;
      state.steps[stepIndex].outputs = step.outputs.filter((socket) => !socket.handles_error);
      state.edges = state.edges.filter(
        (edge) => edge.from_node_id !== payload.stepId || edge.from_socket_id !== errorSocketId,
      );
    }
  }

  return state;
};

const addStep = (state: GraphState, { payload }: AddStepAction) => {
  state.steps.push(payload.step);
  return state;
};

const deleteStep = (state: GraphState, { payload }: DeleteStepAction) => {
  state.steps = state.steps.filter((node) => node.id !== payload.id);
  state.edges = state.edges.filter((edge) => edge.from_node_id !== payload.id && edge.to_node_id !== payload.id);

  if (state.selectedStepId === payload.id) {
    state.selectedStepId = null;
    state.selectedSocketId = null;
  }

  return state;
};

const updateStepMetadata = (state: GraphState, { payload }: UpdateStepMetadataAction) => {
  const stepIndex = state.steps.findIndex((node) => node.id === payload.id);
  state.steps[stepIndex] = {
    ...state.steps[stepIndex],
    ...payload.stepMetadata,
  };
  return state;
};

// Note: we only create data sockets with this method.
// All control sockets are created on initialisation and should not be changed
const addSocket = (state: GraphState, { payload }: AddSocketAction) => {
  const step = state.steps.find((node) => node.id === payload.stepId);
  if (!step) return state;

  (payload.socketDir === SocketDir.Input ? step.inputs : step.outputs)?.push(payload.socket);
  return state;
};

const deleteSocket = (state: GraphState, { payload }: DeleteSocketAction) => {
  const step = state.steps.find((node) => node.id === payload.stepId);
  if (!step) return state;

  step.inputs = step.inputs?.filter((socket) => socket.id !== payload.socketId);
  step.outputs = step.outputs?.filter((socket) => socket.id !== payload.socketId);

  state.edges = state.edges.filter(
    (edge) =>
      !(
        [edge.from_node_id, edge.to_node_id].includes(payload.stepId) &&
        [edge.from_socket_id, edge.to_socket_id].includes(payload.socketId)
      ),
  );

  state.selectedStepId = state.selectedStepId === payload.stepId ? null : state.selectedStepId;
  state.selectedSocketId = state.selectedSocketId === payload.socketId ? null : state.selectedSocketId;

  return state;
};

const updateSocketLabel = (state: GraphState, { payload }: UpdateSocketLabelAction) => {
  const stepIndex = state.steps.findIndex((node) => node.id === payload.stepId);
  if (stepIndex === -1) return state;

  const step = state.steps[stepIndex];
  const socket =
    step.inputs?.find((socket) => socket.id === payload.socketId) ||
    step.outputs?.find((socket) => socket.id === payload.socketId);
  if (socket === undefined) return state;

  socket.label = payload.newSocketLabel;
  return state;
};

const updateSocketMetadata = (state: GraphState, { payload }: UpdateSocketMetadataAction) => {
  const step = state.steps.find((node) => node.id === payload.stepId);
  if (!step) return state;

  const socket =
    step.inputs?.find((socket) => socket.id === payload.socketId) ||
    step.outputs?.find((socket) => socket.id === payload.socketId);
  if (!socket) return state;

  Object.assign(socket, payload.socketMetadata);

  return state;
};

const selectSocket = (state: GraphState, { payload }: SelectSocketAction) => {
  const selectedStep = state.steps.find((node) => node.id === payload.stepId);
  if (!selectedStep) return state;

  // NOTE: This is used only for `InputStep` so far, so this is okay
  const selectedSocket = selectedStep.outputs?.find((socket) => socket.id === payload.socketId);

  if (!selectedSocket) return state;

  state.selectedStepId = selectedStep.id;
  state.selectedSocketId = selectedSocket.id;

  return state;
};

const deselectSocket = (state: GraphState, _action: DeselectSocketAction) => {
  state.selectedStepId = null;
  state.selectedSocketId = null;
  return state;
};

const addEdge = (state: GraphState, { payload }: AddEdgeAction) => {
  state.edges.push({ ...payload });
  return state;
};

const deleteEdge = (state: GraphState, { payload }: DeleteEdgeAction) => {
  state.edges = state.edges.filter((edge) => edge.id !== payload.id);
  return state;
};

const actionHandlers = {
  [GraphActionType.AddStep]: addStep,
  [GraphActionType.DeleteStep]: deleteStep,
  [GraphActionType.UpdateStepMetadata]: updateStepMetadata,
  [GraphActionType.AddSocket]: addSocket,
  [GraphActionType.DeleteSocket]: deleteSocket,
  [GraphActionType.UpdateSocketLabel]: updateSocketLabel,
  [GraphActionType.UpdateSocketMetadata]: updateSocketMetadata,
  [GraphActionType.SelectSocket]: selectSocket,
  [GraphActionType.DeselectSocket]: deselectSocket,
  [GraphActionType.AddEdge]: addEdge,
  [GraphActionType.DeleteEdge]: deleteEdge,
  [GraphActionType.UpdateUserInputStep]: updateUserInputStep,
  [GraphActionType.UpdatePyRunFunctionStep]: updatePyRunFunctionStep,
};

export const graphReducer: ImmerReducer<GraphState, GraphAction> = (
  state: GraphState,
  action: GraphAction,
): GraphState => {
  return actionHandlers[action.type](state, action as any); // eslint-disable-line @typescript-eslint/no-explicit-any
};

export const GraphContext = createContext<GraphState | null>(null);
export const GraphDispatchContext = createContext<Dispatch<GraphAction> | null>(null);
