import { useQuery } from "@tanstack/react-query";
import { useNodeConnections, useNodesData } from "@xyflow/react";
import { RefreshCcw, TriangleAlert } from "lucide-react";
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
    <>
      <div className="flex items-center gap-2">
        function_identifier:
        <Select
          value={functionIdentifier}
          onValueChange={(newFunctionIdentifier) => {
            setFunctionIdentifier(newFunctionIdentifier);
            onChange(newFunctionIdentifier);
          }}
        >
          <SelectTrigger className="w-fit">
            <SelectValue placeholder="Select a function" />
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
          size="sm"
          variant="secondary"
          type="button"
          onClick={() => {
            onChange(functionIdentifier);
          }}
        >
          <RefreshCcw />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        allow_error:
        <Checkbox className="inline bg-transparent text-xs" checked={allowError} onCheckedChange={onAllowErrorChange} />
      </div>
    </>
  ) : (
    <div className="flex flex-col items-center gap-1">
      <div>{(step as PyRunFunctionStep).function_identifier}(...)</div>
      <div>allow_error: {JSON.stringify((step as PyRunFunctionStep).allow_error)}</div>
    </div>
  );
};

export default PyRunMetadata;
