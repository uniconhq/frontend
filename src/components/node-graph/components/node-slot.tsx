import { Handle, HandleType, Position as HandlePosition, useNodeConnections } from "@xyflow/react";
import { ArrowBigRightIcon, PlusIcon, TrashIcon } from "lucide-react";
import { twJoin } from "tailwind-merge";

import { StepSocket } from "@/api";
import NodeInput from "@/components/node-graph/components/step/node-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

const DataSocketDefaultValuePopover = () => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/10">
          <PlusIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 bg-zinc-900">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-zinc-200">Default Value</h4>
            <p className="text-xs text-zinc-400">This value will be used when no input is connected</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="value" className="text-xs text-zinc-400">
              Value
            </Label>
            <Input id="value" placeholder="Enter default value..." className="h-8 border-zinc-700 bg-zinc-800" />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

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
          <div className="flex gap-1">
            <DataSocketDefaultValuePopover />
            <Button className="h-fit w-fit p-1" variant="outline" onClick={onDeleteSocket} type="button">
              <TrashIcon />
            </Button>
          </div>
        </div>
      ) : (
        <span className="min-h-[12px] px-2 text-sm">{socket.label ?? ""}</span>
      )}
    </>
  );
};

const ControlSocket = ({ socket, type }: { socket: StepSocket; type: HandleType }) => {
  return (
    <div className={cn("flex h-fit items-center gap-1 px-1", { "flex-row-reverse": type === "target" })}>
      {socket.label && (
        <>
          <Badge variant="outline" className="border-[#73F777]">
            <span className="py-1 font-mono font-light uppercase text-zinc-300">{socket.label}</span>
          </Badge>
        </>
      )}
      <ArrowBigRightIcon size={25} color="#73F777" />
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
  return <div className="flex flex-col gap-2">{children}</div>;
}
