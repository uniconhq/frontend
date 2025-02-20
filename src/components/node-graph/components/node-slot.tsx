import { Handle, HandleType, Position as HandlePosition, useNodeConnections } from "@xyflow/react";
import { TrashIcon } from "lucide-react";
import { twJoin } from "tailwind-merge";

import { StepSocket } from "@/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import NodeInput from "./step/node-input";

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
}: Omit<NodeSlotProps, "handleStyle"> & { type: "source" | "target" }) => {
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
      {socket.type === "DATA" ? (
        <DataSocket
          socket={socket}
          hideLabel={hideLabel}
          edit={edit}
          allowEditSockets={allowEditSockets}
          onEditSocketLabel={onEditSocketLabel}
          onDeleteSocket={onDeleteSocket}
          type={type}
        />
      ) : (
        <span className="min-h-[12px] text-xs">{socket.label ?? ""}</span>
      )}
    </div>
  );
}

export function NodeSlotGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex grow-0 flex-col">{children}</div>;
}
