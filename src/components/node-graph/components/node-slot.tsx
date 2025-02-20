import { Handle, HandleType, Position as HandlePosition, useNodeConnections } from "@xyflow/react";
import { ArrowBigRightIcon, TrashIcon } from "lucide-react";
import { twJoin } from "tailwind-merge";

import { StepSocket } from "@/api";
import NodeInput from "@/components/node-graph/components/step/node-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NodeSlotProps {
  socket: StepSocket;
  type: HandleType;
  hideLabel?: boolean;
  edit?: boolean;
  allowEditSockets?: boolean;
  onEditSocketLabel?: (newSocketLabel: string) => void;
  onDeleteSocket?: () => void;
  handleStyle?: React.CSSProperties;
}

const DataSocket = ({
  socket,
  hideLabel,
  edit,
  allowEditSockets,
  onEditSocketLabel,
  onDeleteSocket,
  type,
}: Omit<NodeSlotProps, "handleStyle"> & { type: HandleType }) => {
  if (hideLabel) return null;

  const editable = edit && allowEditSockets;
  return (
    <>
      {editable ? (
        <div
          className={cn("flex grow items-center justify-between gap-2 px-2", {
            "flex-row-reverse space-x-reverse": type === "source",
          })}
        >
          <NodeInput
            className={[cn({ "text-right": type === "source" })]}
            value={socket.label ?? ""}
            onChange={onEditSocketLabel ?? (() => {})}
          />
          <Button className="h-fit w-fit p-1" variant="outline" onClick={onDeleteSocket} type="button">
            <TrashIcon />
          </Button>
        </div>
      ) : (
        <span className="min-h-[12px] px-2 text-sm">{socket.label ?? ""}</span>
      )}
    </>
  );
};

const ControlSocket = ({ socket, type }: { socket: StepSocket; type: HandleType }) => {
  return (
    <div className={cn("flex items-center gap-1 px-1", { "flex-row-reverse": type === "target" })}>
      {socket.label && (
        <>
          <Badge variant="outline" className="border-[#73F777]">
            <span className="font-mono font-medium">{socket.label}</span>
          </Badge>
        </>
      )}
      <ArrowBigRightIcon color="#73F777" />
    </div>
  );
};

export function NodeSlot({
  socket,
  type,
  hideLabel = false,
  edit = false,
  allowEditSockets = true,
  onEditSocketLabel,
  onDeleteSocket,
  handleStyle,
}: NodeSlotProps) {
  const connections = useNodeConnections({
    handleType: type,
    handleId: socket.id,
  });
  const hasConnections = connections.length > 0;

  return (
    <div
      className={twJoin(
        "relative my-1 flex items-center space-x-2",
        type === "source" && "flex-row-reverse space-x-reverse",
      )}
    >
      <Handle
        style={{
          width: "12px",
          height: "12px",
          backgroundColor: hasConnections ? "white" : "black",
          border: "1px solid white",
          ...(handleStyle ?? {}),
        }} // NOTE: Override default position to use flex positioning
        className={twJoin(
          "bg-neutral-700",
          type === "target" && "rounded-bl-full rounded-tl-full",
          type === "source" && "rounded-br-full rounded-tr-full",
        )}
        id={socket.id}
        type={type}
        position={type === "target" ? HandlePosition.Left : HandlePosition.Right}
      />
      {socket.type === "CONTROL" ? (
        <ControlSocket socket={socket} type={type} />
      ) : (
        <DataSocket
          socket={socket}
          hideLabel={hideLabel}
          edit={edit}
          allowEditSockets={allowEditSockets}
          onEditSocketLabel={onEditSocketLabel}
          onDeleteSocket={onDeleteSocket}
          type={type}
        />
      )}
    </div>
  );
}

export function NodeSlotGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex grow-0 flex-col">{children}</div>;
}
