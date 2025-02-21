import { Trash } from "lucide-react";
import * as React from "react";

import { InputStep, Testcase as TestcaseApi } from "@/api";
import ConfirmationDialog from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import NodeGraph from "@/features/problems/components/tasks/node-graph";

import { GraphAction } from "./graph-context";

type TestcaseProps = {
  index: number;
  testcase: TestcaseApi;
  // Node graph editor props
  edit: boolean;
  nodeGraphOnChange?: (action: GraphAction) => void;
  // Used during testcase creation where each testcase has the same user input
  // NOTE: If this is set, the nodes in the testcase will not contain the user input node
  sharedUserInput?: InputStep;
  onDelete?: (index: number) => void;
};

const Testcase: React.FC<TestcaseProps> = ({ index, testcase, edit, nodeGraphOnChange, sharedUserInput, onDelete }) => {
  return (
    <Collapsible defaultOpen className="w-full space-y-2">
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button variant="outline" key={index}>
            #{index + 1}
          </Button>
        </CollapsibleTrigger>
        {onDelete && (
          <ConfirmationDialog
            description="Are you sure you want to delete this testcase?"
            onConfirm={() => onDelete(index)}
          >
            <Button variant="destructive">
              <Trash />
            </Button>
          </ConfirmationDialog>
        )}
      </div>
      <CollapsibleContent className="space-y-4">
        <NodeGraph
          edit={edit}
          id={testcase.id}
          key={testcase.id}
          sharedUserInput={sharedUserInput}
          steps={testcase.nodes}
          edges={testcase.edges}
          onChange={nodeGraphOnChange}
        />
      </CollapsibleContent>
    </Collapsible>
  );
};

export default Testcase;
