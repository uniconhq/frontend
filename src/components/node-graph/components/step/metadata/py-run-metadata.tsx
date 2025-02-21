import { useQuery } from "@tanstack/react-query";
import { useNodeConnections, useNodesData } from "@xyflow/react";
import { ParenthesesIcon, RefreshCcw, TriangleAlert } from "lucide-react";
import { useContext, useState } from "react";

import { File, InputStep, PyRunFunctionStep } from "@/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  GraphActionType,
  GraphContext,
  GraphDispatchContext,
} from "@/features/problems/components/tasks/graph-context";
import { getFunctions } from "@/features/problems/queries";
import { isFile, uuid } from "@/lib/utils";

type OwnProps = {
  step: PyRunFunctionStep;
};

const PyRunMetadata: React.FC<OwnProps> = ({ step }) => {
  const { edit } = useContext(GraphContext)!;
  const dispatch = useContext(GraphDispatchContext)!;

  const [functionIdentifier, setFunctionIdentifier] = useState(step.function_identifier);

  const [allowError, setAllowError] = useState(step.allow_error || false);

  // We find the python file by tracing the connection from the file's input (with import_as_module = true)
  // to the input step's socket containing the file.
  const fileInput = step.inputs.find((input) => input.import_as_module);
  const connections = useNodeConnections({
    handleType: "target",
    handleId: fileInput?.id ?? "",
    id: step.id,
  });
  const connection = connections[0];
  const inputNode = useNodesData(connection?.source);
  const fileSocket = (inputNode?.data as InputStep | undefined)?.outputs.find(
    (output) => output.id === connection.sourceHandle,
  );
  const fileContent = fileSocket && isFile(fileSocket.data) ? (fileSocket.data as File).content : undefined;

  const { data: functionSignatures } = useQuery(getFunctions(fileContent ?? ""));

  const onChange = (newFunctionIdentifier: string) => {
    const newFunctionSignature = functionSignatures?.find((signature) => signature.name === newFunctionIdentifier);
    if (!newFunctionSignature) return;
    // Length of inputs array (args + kwargs) + 2 (function_identifier and allow_error) + 2 (output and error)
    const uuidsNeeded = newFunctionSignature.args.length + newFunctionSignature.kwargs.length + 4;
    const uuids = Array.from({ length: uuidsNeeded }, uuid);
    dispatch({
      type: GraphActionType.UpdatePyRunFunctionStep,
      payload: {
        stepId: step.id,
        functionIdentifier: newFunctionIdentifier,
        functionSignature: newFunctionSignature,
        allowError: !!step.allow_error,
        uuids: uuids,
      },
    });
  };

  const onAllowErrorChange = () => {
    const uuids = [uuid()];
    setAllowError((allowError) => {
      dispatch({
        type: GraphActionType.UpdatePyRunFunctionStep,
        payload: {
          stepId: step.id,
          functionIdentifier,
          allowError: !allowError,
          uuids: uuids,
        },
      });
      return !allowError;
    });
  };

  const isFunctionMissing =
    functionIdentifier && !functionSignatures?.filter((signature) => signature.name === functionIdentifier).length;

  return edit ? (
    <div className="flex flex-col gap-2 border-b-2 border-zinc-800 px-3 pb-4 pt-2 font-mono">
      <div className="flex items-center gap-2">
        <label className="text-nowrap font-mono text-sm text-zinc-400">Function Identifier:</label>
        <Select
          value={functionIdentifier}
          onValueChange={(newFunctionIdentifier) => {
            setFunctionIdentifier(newFunctionIdentifier);
            onChange(newFunctionIdentifier);
          }}
        >
          <SelectTrigger className="bor h-8 min-w-[120px] text-xs">
            <SelectValue placeholder="Select a function" className="p-2" />
          </SelectTrigger>
          <SelectContent>
            {functionSignatures?.map((signature) => (
              <SelectItem key={signature.name} value={signature.name}>
                {signature.name}
              </SelectItem>
            ))}
            {isFunctionMissing && <SelectItem value={functionIdentifier}>{functionIdentifier}</SelectItem>}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          {isFunctionMissing && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TriangleAlert className="h-4 w-4 text-yellow-500" />
                </TooltipTrigger>
                <TooltipContent className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 text-yellow-600" /> Function not found. Please check the file.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button
            size="icon"
            variant="ghost"
            type="button"
            onClick={() => {
              onChange(functionIdentifier);
            }}
          >
            <RefreshCcw />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="font-mono text-sm text-zinc-400">Propagate Error:</label>
        <Checkbox
          className="inline h-5 w-5 border-zinc-400 bg-transparent text-xs"
          checked={allowError}
          onCheckedChange={onAllowErrorChange}
        />
      </div>
    </div>
  ) : (
    <div className="min-w-[280px] px-2 pt-3">
      <div className="flex items-center gap-3">
        <ParenthesesIcon size={20} className="text-zinc-400" />
        <div className="flex flex-col">
          <span className="text-xs text-zinc-400">Function Identifier</span>
          <span className="font-mono font-medium text-white">{(step as PyRunFunctionStep).function_identifier}</span>
        </div>
      </div>
      <div className="pt-3">
        <div className="flex items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-2">
          <span className="font-mono text-xs text-zinc-400">Propagate Error</span>
          <span className="rounded-md bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-300">
            {JSON.stringify((step as PyRunFunctionStep).allow_error)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PyRunMetadata;
