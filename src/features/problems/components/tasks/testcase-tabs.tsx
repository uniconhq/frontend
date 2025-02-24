import { File, InputStep, Testcase as TestcaseApi } from "@/api";
import EmptyPlaceholder from "@/components/layout/empty-placeholder";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { GraphAction } from "./graph-context";
import Testcase from "./testcase";

type SettingsChange = {
  name?: string;
  isPrivate?: boolean;
};

type OwnProps = {
  testcases: TestcaseApi[];
  edit: boolean;
  taskFiles: File[];
  sharedUserInput?: InputStep;
  onDelete?: (index: number) => () => void;
  onGraphChange?: (index: number) => (action: GraphAction) => void;
  onSettingsChange?: (index: number) => (change: SettingsChange) => void;
  onDuplicateTestcase?: (index: number) => () => void;
};

const TestcaseTabs: React.FC<OwnProps> = ({
  testcases,
  edit,
  taskFiles,
  sharedUserInput,
  onDelete,
  onGraphChange,
  onSettingsChange,
  onDuplicateTestcase,
}) => {
  if (testcases.length === 0) {
    return (
      <div className="mt-4">
        <EmptyPlaceholder description="No testcases added." />
      </div>
    );
  }

  return (
    <Tabs defaultValue={testcases[0]?.id}>
      <div className="flex justify-between">
        <TabsList>
          {testcases.map((testcase, index) => (
            <TabsTrigger key={testcase.id} value={testcase.id} className="text-sm">
              #{index + 1} {testcase.name} {testcase.is_private ? "(Private)" : ""}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {testcases.map((testcase, index) => (
        <TabsContent key={testcase.id} value={testcase.id}>
          <Testcase
            edit={edit}
            index={index}
            nodeGraphOnChange={onGraphChange && onGraphChange(index)}
            sharedUserInput={sharedUserInput}
            taskFiles={taskFiles}
            testcase={testcase}
            onDelete={onDelete}
            onSettingsChange={onSettingsChange && onSettingsChange(index)}
            onDuplicateTestcase={onDuplicateTestcase && onDuplicateTestcase(index)}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
};

export default TestcaseTabs;
