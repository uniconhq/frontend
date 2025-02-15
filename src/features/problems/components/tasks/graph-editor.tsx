import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  MarkerType,
  MiniMap,
  Node,
  ReactFlow,
  ReactFlowInstance,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
} from "@xyflow/react";
import { ExpandIcon, ShrinkIcon } from "lucide-react";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { GraphEdgeStr } from "@/api";
import { StepNode } from "@/components/node-graph/components/step/step-node";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import getLayoutedElements from "@/utils/graph";

import AddNodeButton from "./add-node-button";
import {
  GraphActionType,
  GraphContext,
  GraphDispatchContext,
} from "./graph-context";
import GraphFileEditor from "./graph-file-editor";
import { Step } from "./types";

const nodeTypes = { step: StepNode };

const stepNodeToRfNode = (step: Step): Node<Step> => ({
  id: step.id.toString(),
  position: { x: 0, y: 0 },
  data: step,
  type: "step",
});

const stepEdgeToRfEdge = (edge: GraphEdgeStr): Edge => ({
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

type RfInstance = ReactFlowInstance<Node<Step>, Edge>;

type GraphEditorProps = {
  graphId: string;
  className?: string;
};

const GraphEditor: React.FC<GraphEditorProps> = ({ graphId, className }) => {
  const { steps, edges, edit, selectedSocketId } = useContext(GraphContext)!;

  const nodeData = useMemo(() => steps.map(stepNodeToRfNode), [steps]);
  const edgeData = useMemo(() => edges.map(stepEdgeToRfEdge), [edges]);

  const flowNodesInitialized = useNodesInitialized();
  const [layoutApplied, setLayoutApplied] = useState(false);
  const [rfInstance, setRfInstance] = useState<RfInstance | null>(null);
  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState(nodeData);
  const [flowEdges, setFlowEdges, onFlowEdgesChange] = useEdgesState(edgeData);

  const [expanded, setExpanded] = useState(false);

  const onInit = (rf: RfInstance) => setRfInstance(rf);

  useEffect(() => {
    if (!flowNodesInitialized || layoutApplied) return;

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      flowNodes,
      flowEdges,
    );
    setFlowNodes([...layoutedNodes]);
    setFlowEdges([...layoutedEdges]);

    setLayoutApplied(true);
  }, [flowNodesInitialized, layoutApplied]);

  useEffect(() => {
    if (!layoutApplied || !rfInstance) return;
    rfInstance.fitView();
  }, [layoutApplied, rfInstance]);

  useEffect(() => {
    setFlowNodes((flowNodes) =>
      nodeData.map((node) => {
        const existingRfNode = flowNodes.find((n) => n.id === node.id);
        return existingRfNode ? { ...existingRfNode, data: node.data } : node;
      }),
    );
  }, [nodeData, setFlowNodes]);

  useEffect(() => setFlowEdges(edgeData), [edgeData, setFlowEdges]);

  const dispatch = useContext(GraphDispatchContext)!;

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!edit) return;

      dispatch({
        type: GraphActionType.AddEdge,
        payload: {
          from_node_id: connection.source,
          from_socket_id: connection.sourceHandle!,
          to_node_id: connection.target,
          to_socket_id: connection.targetHandle!,
        },
      });
    },
    [dispatch, edit],
  );

  const edgeReconnectSuccessful = useRef(true);

  const onReconnectStart = useCallback(() => {
    if (!edit) return;
    edgeReconnectSuccessful.current = false;
  }, [edit]);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!edit) return;

      dispatch({
        type: GraphActionType.DeleteEdge,
        payload: { id: oldEdge.id },
      });
      dispatch({
        type: GraphActionType.AddEdge,
        payload: {
          from_node_id: newConnection.source,
          from_socket_id: newConnection.sourceHandle!,
          to_node_id: newConnection.target,
          to_socket_id: newConnection.targetHandle!,
        },
      });
      edgeReconnectSuccessful.current = true;
    },
    [dispatch, edit],
  );

  const onReconnectEnd = useCallback(
    (_: unknown, edge: Edge) => {
      if (!edit) return;

      if (!edgeReconnectSuccessful.current) {
        dispatch({
          type: GraphActionType.DeleteEdge,
          payload: { id: edge.id },
        });
        setFlowEdges((eds) => eds.filter((e) => e.id !== edge.id));
      }

      edgeReconnectSuccessful.current = true;
    },
    [dispatch, setFlowEdges, edit],
  );

  return (
    <div
      className={cn(className, {
        "fixed inset-0 z-30 h-full bg-black/100 animate-in fade-in": expanded,
      })}
      data-state={expanded ? "open" : "closed"}
    >
      <ResizablePanelGroup direction="horizontal">
        {selectedSocketId && (
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
            onNodesChange={onFlowNodesChange}
            onEdgesChange={onFlowEdgesChange}
            onConnect={onConnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            onReconnect={onReconnect}
            nodesConnectable={edit}
            edgesReconnectable={edit}
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
          >
            {/* Custom controls */}
            <div
              className={cn(
                "absolute right-1 top-1 z-10 mt-4 flex space-x-1 px-2",
                { "z-30": expanded },
              )}
            >
              {edit && <AddNodeButton />}
              <Button
                onClick={() => setExpanded((prev) => !prev)}
                type="button"
                variant="outline"
              >
                {expanded ? <ShrinkIcon /> : <ExpandIcon />}
              </Button>
            </div>
            <Background
              variant={BackgroundVariant.Dots}
              style={{
                backgroundColor: "#1c1c1c",
              }}
            />
            <Controls showInteractive={edit} />
            <MiniMap />
          </ReactFlow>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default GraphEditor;
