import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  IsValidConnection,
  MarkerType,
  MiniMap,
  Node,
  OnBeforeDelete,
  ReactFlow,
  ReactFlowInstance,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
} from "@xyflow/react";
import { CopyPlus, ExpandIcon, ShrinkIcon } from "lucide-react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { GraphEdgeStr as GraphEdge, InputStep } from "@/api";
import { StepNode } from "@/components/node-graph/components/step/step-node";
import { Button } from "@/components/ui/button";
import { FileTree } from "@/components/ui/file-tree";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { convertFilesToFileTree } from "@/lib/files";
import { cn, isFile, uuid } from "@/lib/utils";
import getLayoutedElements from "@/utils/graph";

import AddNodeButton from "./add-node-button";
import { GraphActionType, GraphContext, GraphDispatchContext } from "./graph-context";
import GraphFileEditor from "./graph-file-editor";
import TestcaseSettings from "./testcase-settings";
import { Step } from "./types";

type RfInstance = ReactFlowInstance<Node<Step>, Edge>;

type GraphEditorProps = {
  graphId: string;
  className?: string;

  // For testcase settings menu
  settings?: { name?: string; isPrivate?: boolean };
  onDelete?: () => void;
  onSettingsChange?: (change: { name?: string; isPrivate?: boolean }) => void;
  onDuplicateTestcase?: () => void;
};

const nodeTypes = { step: StepNode };

const stepNodeToRfNode = (step: Step): Node<Step> => ({
  id: step.id,
  position: { x: 0, y: 0 },
  data: step,
  type: "step",
});

const stepEdgeToRfEdge = (edge: GraphEdge): Edge => ({
  id: edge.id,
  source: edge.from_node_id,
  sourceHandle: edge.from_socket_id,
  target: edge.to_node_id,
  targetHandle: edge.to_socket_id,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 20,
    height: 20,
  },
});

const GraphEditor: React.FC<GraphEditorProps> = ({
  graphId,
  className,
  onDelete,
  onSettingsChange,
  settings,
  onDuplicateTestcase,
}) => {
  const { steps, edges, edit, selectedSocketId, selectedStepId, files } = useContext(GraphContext)!;
  const dispatch = useContext(GraphDispatchContext)!;

  const nodeData = useMemo(() => steps.map(stepNodeToRfNode), [steps]);
  const edgeData = useMemo(() => edges.map(stepEdgeToRfEdge), [edges]);

  const flowNodesInitialized = useNodesInitialized();
  const [layoutApplied, setLayoutApplied] = useState(false);
  const [rfInstance, setRfInstance] = useState<RfInstance | null>(null);
  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState(nodeData);
  const [flowEdges, setFlowEdges, onFlowEdgesChange] = useEdgesState(edgeData);

  const [expanded, setExpanded] = useState(false);

  const onInit = (rf: RfInstance) => setRfInstance(rf);

  // Apply layout algorithm to graph after nodes are initialized by ReactFlow
  useEffect(() => {
    if (flowNodesInitialized && !layoutApplied) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, flowEdges);
      setFlowNodes([...layoutedNodes]);
      setFlowEdges([...layoutedEdges]);
      setLayoutApplied(true);
    }
  }, [flowNodesInitialized, layoutApplied]);

  // Fit graph to viewport after layout is applied
  // This will only be done once after layout is applied and not on every update graph state (e.g. node/edge changes)
  useEffect(() => {
    if (layoutApplied && rfInstance) {
      rfInstance.fitView();
    }
  }, [layoutApplied, rfInstance]);

  // Update ReactFlow internal states when graph state changes
  useEffect(() => {
    setFlowNodes((flowNodes) =>
      nodeData.map((node) => {
        // Only update data of existing nodes while retaining their position
        const existingRfNode = flowNodes.find((n) => n.id === node.id);
        return existingRfNode ? { ...existingRfNode, data: node.data } : node;
      }),
    );
    setFlowEdges(edgeData);
  }, [nodeData, edgeData, setFlowNodes, setFlowEdges]);

  // NOTE: This is triggered before all the other event handlers e.g. onNodeDelete, onEdgesDelete, onNodesChange, onEdgesChange
  // All nodes and edges returned by this handler will then be passed to the respective event handlers
  const onBeforeDelete: OnBeforeDelete<Node<Step>, Edge> = useCallback(
    async ({ nodes, edges }) => {
      // Do not allow any deletes if edit mode is disabled
      if (!edit) return false;

      // Filter out user `InputStep` nodes to prevent deletion
      const userNodes = nodes.filter((node) => {
        const data = node.data as Step;
        return data.type === "INPUT_STEP" && (data as InputStep).is_user;
      });
      // Preserve user `InputStep` nodes
      const nonUserNodes = nodes.filter((node) => userNodes.indexOf(node) === -1);
      // Preserve outgoing edges of user `InputStep` edges if user `InputStep` nodes are deleted
      // This is to retain expected behavior where edges are preserved when we prevent deletion of user `InputStep` nodes
      const nonUserEdges = edges.filter((edge) => userNodes.find((node) => node.id === edge.source) === undefined);

      return { nodes: nonUserNodes, edges: nonUserEdges };
    },
    [edit],
  );

  // Node handlers

  const onNodesDelete = useCallback(
    (nodes: Node<Step>[]) => {
      if (edit) nodes.forEach(({ id }) => dispatch({ type: GraphActionType.DeleteStep, payload: { id } }));
    },
    [dispatch, edit],
  );

  // Edge handlers

  const onEdgesDelete = useCallback(
    (edges: Edge[]) => {
      if (edit) edges.forEach(({ id }) => dispatch({ type: GraphActionType.DeleteEdge, payload: { id } }));
    },
    [dispatch, edit],
  );

  const onConnect = useCallback(
    ({ source, sourceHandle, target, targetHandle }: Connection) => {
      if (!edit) return;
      dispatch({
        type: GraphActionType.AddEdge,
        payload: {
          id: uuid(),
          from_node_id: source,
          from_socket_id: sourceHandle!,
          to_node_id: target,
          to_socket_id: targetHandle!,
        },
      });
    },
    [dispatch, edit],
  );

  // Edge reconnect handling

  const edgeReconnectSuccessful = useRef(true);

  const onReconnectStart = useCallback(() => (edgeReconnectSuccessful.current = false), []);

  const onReconnect = useCallback(
    ({ id }: Edge, { source, sourceHandle, target, targetHandle }: Connection) => {
      dispatch({ type: GraphActionType.DeleteEdge, payload: { id } });
      dispatch({
        type: GraphActionType.AddEdge,
        payload: {
          id: uuid(),
          from_node_id: source,
          from_socket_id: sourceHandle!,
          to_node_id: target,
          to_socket_id: targetHandle!,
        },
      });
      edgeReconnectSuccessful.current = true;
    },
    [dispatch],
  );

  const onReconnectEnd = useCallback(
    (_: unknown, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) dispatch({ type: GraphActionType.DeleteEdge, payload: { id: edge.id } });
      edgeReconnectSuccessful.current = true;
    },
    [dispatch],
  );

  // Edge connection validation

  const isValidConnection: IsValidConnection<Edge> = useCallback(
    ({ source, sourceHandle, target, targetHandle }) => {
      const sourceStep = steps.find((step) => step.id === source);
      const targetStep = steps.find((step) => step.id === target);
      const sourceSocket = sourceStep?.outputs?.find((socket) => socket.id === sourceHandle);
      const targetSocket = targetStep?.inputs?.find((socket) => socket.id === targetHandle);
      // This should never happen but just in case
      if (!sourceStep || !targetStep || !sourceSocket || !targetSocket) return false;

      // Do not allow connections between different socket types e.g. "DATA" to "CONTROL" and vice versa
      if (sourceSocket.type !== targetSocket.type) return false;

      // Do not allow "DATA" connections if there is already an edge connected to target node socket/handle
      // This is to prevent multiple "DATA" inputs to a single node socket/handle
      // This is not applicable to "CONTROL" connections since it is perfectly valid to have multiple nodes
      // execute before a single node
      if (targetSocket.type === "DATA")
        return !edges.some((edge) => edge.to_node_id === target && edge.to_socket_id === targetHandle);

      return true;
    },
    [steps, edges],
  );

  // Additional UI components

  const selectedStep = steps.find((step) => step.id === selectedStepId);
  const selectedSocket = selectedStep?.outputs?.find((socket) => socket.id === selectedSocketId);

  const [showFileTree, setShowFileTree] = useState(false);
  const showFileEditor = selectedSocket && isFile(selectedSocket.data) && !selectedSocket?.data.on_minio;

  // Fit view to selected step when it changes
  useEffect(() => {
    if (!rfInstance || !selectedStep) return;
    rfInstance.fitView({ nodes: [{ id: selectedStep.id }], duration: 1000, maxZoom: 0.8 });
  }, [selectedStep]);

  const treeFiles = files.map((file) => ({
    id: file.id,
    name: file.path.split("/").pop()!,
    path: file.path,
    content: file.content,
    isBinary: !!file.on_minio,
    downloadUrl: "",
    onClick: () => {
      // Figure out if this file is in the graph. If yes, select it.
      const step = steps.find((step) =>
        step.outputs?.find((socket) => isFile(socket.data) && socket.data?.id === file.id),
      );
      const socket = step?.outputs?.find((socket) => isFile(socket.data) && socket.data?.id === file.id);
      if (!step || !socket) return;
      dispatch({ type: GraphActionType.SelectSocket, payload: { stepId: step.id, socketId: socket.id } });
    },
    highlighted: isFile(selectedSocket?.data) && selectedSocket?.data.id === file.id,
  }));

  return (
    <div
      className={cn(className, {
        "fixed inset-0 z-30 h-full bg-black/100 animate-in fade-in": expanded,
      })}
      data-state={expanded ? "open" : "closed"}
    >
      <ResizablePanelGroup direction="horizontal">
        {showFileTree && (
          <FileTree files={convertFilesToFileTree(treeFiles)} onCloseFileTree={() => setShowFileTree(false)} />
        )}
        {showFileEditor && (
          <>
            <ResizablePanel defaultSize={2} order={0}>
              <GraphFileEditor />
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}
        <ResizablePanel defaultSize={3} order={1}>
          <ReactFlow
            id={graphId}
            onInit={onInit}
            nodeTypes={nodeTypes}
            nodes={flowNodes}
            edges={flowEdges}
            onBeforeDelete={onBeforeDelete}
            onNodesChange={onFlowNodesChange}
            onEdgesChange={onFlowEdgesChange}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onConnect={onConnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            onReconnect={onReconnect}
            nodesConnectable={edit}
            edgesReconnectable={edit}
            isValidConnection={isValidConnection}
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
            className={cn(!layoutApplied && "")}
          >
            {/* Custom controls */}
            <div
              className={cn("absolute right-1 top-1 z-10 mt-4 flex w-full justify-between px-2", {
                "z-30": expanded,
              })}
            >
              <div className="ml-2">
                {!showFileTree && (
                  <Button variant="outline" type="button" onClick={() => setShowFileTree(true)}>
                    Show files
                  </Button>
                )}
              </div>
              <div className="flex space-x-1">
                {edit && <AddNodeButton />}
                {edit && onDelete && settings && onSettingsChange && (
                  <TestcaseSettings onDelete={onDelete} onSettingsChange={onSettingsChange} settings={settings} />
                )}
                {edit && onDuplicateTestcase && (
                  <Button onClick={onDuplicateTestcase} type="button" variant="outline">
                    <CopyPlus /> Duplicate testcase
                  </Button>
                )}
                <Button onClick={() => setExpanded((prev) => !prev)} type="button" variant="outline">
                  {expanded ? <ShrinkIcon /> : <ExpandIcon />}
                </Button>
              </div>
            </div>
            <Background variant={BackgroundVariant.Dots} style={{ backgroundColor: "#1c1c1c" }} />
            <Controls showInteractive={edit} />
            <MiniMap pannable className="opacity-50 hover:opacity-100" />
          </ReactFlow>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default GraphEditor;
