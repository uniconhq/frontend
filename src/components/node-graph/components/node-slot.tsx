import { Handle, HandleType, Position as HandlePosition, useNodeConnections } from "@xyflow/react";
import { ArrowBigRightIcon, PlusIcon, TrashIcon } from "lucide-react";
import { twJoin } from "tailwind-merge";
import { useDebouncedCallback } from "use-debounce";

import { StepSocket } from "@/api";
import NodeInput from "@/components/node-graph/components/step/node-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, isFile } from "@/lib/utils";

interface NodeSlotProps {
  type: HandleType;
  socket: StepSocket;
  // Edit props
  onEditLabel?: (newSocketLabel: string) => void;
  onEditData?: (newSocketData: string | boolean | number) => void;
  onDelete?: () => void;
  // Styling props
  hideLabel?: boolean;
  handleStyle?: React.CSSProperties;
}

const DataSocketDefaultValuePopover = ({
  children,
  onValueChanged,
}: {
  children?: React.ReactNode;
  onValueChanged?: (newSocketData: string | boolean | number) => void;
}) => {
  const debouncedOnValueChanged = useDebouncedCallback((value: string) => {
    let parsedValue: string | boolean | number = value;

    if (value.startsWith('"') && value.endsWith('"')) parsedValue = value.slice(1, -1);
    else if (value.toLowerCase() === "true") parsedValue = true;
    else if (value.toLowerCase() === "false") parsedValue = false;
    else if (!isNaN(Number(value))) parsedValue = Number(value);

    if (onValueChanged) onValueChanged(parsedValue);
  }, 500);

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
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
            <Input
              id="value"
              placeholder="Enter default value..."
              className="h-8 border-zinc-700 bg-zinc-800"
              onChange={(e) => debouncedOnValueChanged(e.target.value)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const DataSocketDefaultValueDisplay = ({
  hasDefaultValue,
  socketDefaultValue,
  onValueChanged,
}: {
  hasDefaultValue: boolean;
  socketDefaultValue: string | boolean | number;
  onValueChanged?: (newSocketData: string | boolean | number) => void;
}) => {
  const content = hasDefaultValue ? (
    <div className="flex items-center gap-2 py-1">
      <div className="rounded-md border border-zinc-700/50 bg-zinc-800/50 px-2 py-1 hover:bg-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Default:</span>
          <span className="font-mono text-xs text-orange-400">{JSON.stringify(socketDefaultValue)}</span>
        </div>
      </div>
    </div>
  ) : onValueChanged ? (
    <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/10">
      <PlusIcon className="h-4 w-4" />
    </Button>
  ) : null;

  return onValueChanged ? (
    <DataSocketDefaultValuePopover onValueChanged={onValueChanged}>{content}</DataSocketDefaultValuePopover>
  ) : (
    content
  );
};

const DataSocket = ({
  type,
  socket,
  onEditLabel,
  onEditData,
  onDelete,
}: Omit<NodeSlotProps, "handleStyle" | "hideLabel">) => {
  const socketLabel = socket.label ?? "";
  const hasDefaultValue = socket.data && !isFile(socket.data) ? true : false;
  const socketDefaultValue = socket.data as string | boolean | number;
  return (
    <div
      className={cn("flex grow items-center gap-2 px-2", {
        "flex-row-reverse space-x-reverse": type === "source",
      })}
    >
      {onEditLabel ? (
        <NodeInput className={[cn({ "text-right": type === "source" })]} value={socketLabel} onChange={onEditLabel} />
      ) : (
        socketLabel && <span className="min-h-[12px]">{socketLabel}</span>
      )}

      {type === "target" && (
        <DataSocketDefaultValueDisplay
          hasDefaultValue={hasDefaultValue}
          socketDefaultValue={socketDefaultValue}
          onValueChanged={onEditData}
        />
      )}
      {onDelete && (
        <Button className="h-fit w-fit p-1" variant="outline" onClick={onDelete} type="button">
          <TrashIcon />
        </Button>
      )}
    </div>
  );
};

const ControlSocket = ({ type, socket }: { type: HandleType; socket: StepSocket }) => {
  return (
    <div className={cn("flex h-fit items-center gap-1 px-1", { "flex-row-reverse": type === "target" })}>
      {socket.label && (
        <>
          <Badge variant="outline" className="border-[#73F777]">
            <span className="py-1 font-mono font-light uppercase text-zinc-400">{socket.label}</span>
          </Badge>
        </>
      )}
      <ArrowBigRightIcon size={25} color="#73F777" />
    </div>
  );
};

export function NodeSlot({
  type,
  socket,
  onEditLabel,
  onEditData,
  onDelete,
  hideLabel = false,
  handleStyle,
}: NodeSlotProps) {
  const connections = useNodeConnections({ handleType: type, handleId: socket.id });
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
      {!hideLabel &&
        (socket.type === "CONTROL" ? (
          <ControlSocket socket={socket} type={type} />
        ) : (
          <DataSocket
            type={type}
            socket={socket}
            onEditData={onEditData}
            onEditLabel={onEditLabel}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}
