import { createContext, Dispatch } from "react";
import { ImmerReducer } from "use-immer";

import { GraphEdgeStr as GraphEdge, InputStep, StepSocket } from "@/api";
import { Step } from "@/features/problems/components/tasks/types";
import { uuid } from "@/lib/utils";

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
  | UpdateUserInputStepAction;

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
  state.edges.push({ id: uuid(), ...payload });
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
};

export const graphReducer: ImmerReducer<GraphState, GraphAction> = (
  state: GraphState,
  action: GraphAction,
): GraphState => {
  return actionHandlers[action.type](state, action as any); // eslint-disable-line @typescript-eslint/no-explicit-any
};

export const GraphContext = createContext<GraphState | null>(null);
export const GraphDispatchContext = createContext<Dispatch<GraphAction> | null>(null);
