import * as React from "react";

import { File as ApiFile, InputStep, Testcase as TestcaseApi } from "@/api";
import NodeGraph from "@/features/problems/components/tasks/node-graph";

import { GraphAction } from "./graph-context";

type TestcaseProps = {
  index: number;
  testcase: TestcaseApi;
  taskFiles: ApiFile[];
  // Node graph editor props
  edit: boolean;
  nodeGraphOnChange?: (action: GraphAction) => void;
  // Used during testcase creation where each testcase has the same user input
  // NOTE: If this is set, the nodes in the testcase will not contain the user input node
  sharedUserInput?: InputStep;
  onDelete?: (index: number) => () => void;
  // For testcase settings metadata (e.g. name, private)
  onSettingsChange?: (change: { name?: string; isPrivate?: boolean }) => void;
  onDuplicateTestcase?: () => void;
};

const Testcase: React.FC<TestcaseProps> = ({
  index,
  testcase,
  edit,
  nodeGraphOnChange,
  sharedUserInput,
  onDelete,
  taskFiles,
  onSettingsChange,
  onDuplicateTestcase,
}) => {
  const settings = { name: testcase.name, isPrivate: testcase.is_private };

  return (
    <NodeGraph
      edit={edit}
      id={testcase.id}
      key={testcase.id}
      taskFiles={taskFiles}
      sharedUserInput={sharedUserInput}
      steps={testcase.nodes}
      edges={testcase.edges}
      onChange={nodeGraphOnChange}
      // For testcase settings menu
      settings={settings}
      onDelete={onDelete && onDelete(index)}
      onSettingsChange={onSettingsChange}
      onDuplicateTestcase={onDuplicateTestcase}
    />
  );
};

export default Testcase;
