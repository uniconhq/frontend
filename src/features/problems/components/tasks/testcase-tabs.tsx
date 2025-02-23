import { useQuery } from "@tanstack/react-query";

import { File, InputStep, OutputStep, Testcase as TestcaseApi } from "@/api";
import EmptyPlaceholder from "@/components/layout/empty-placeholder";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProblemId } from "@/features/projects/hooks/use-id";

import { getProblemById } from "../../queries";
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
  onDelete?: (index: number) => void;
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
  const problemId = useProblemId();
  const { data: problem } = useQuery(getProblemById(problemId));
  const showDetails = !!problem?.view_hidden_details;

  if (testcases.length === 0) {
    return (
      <div className="mt-4">
        <EmptyPlaceholder description="No testcases added." />
      </div>
    );
  }

  const testcaseOutputSteps: (OutputStep | undefined)[] = testcases.map(
    (testcase) => testcase.nodes.find((node) => node.type === "OUTPUT_STEP") as OutputStep,
  );
  return (
    <Tabs defaultValue={testcases[0]?.id}>
      <TabsList>
        {testcases.map((testcase, index) => (
          <TabsTrigger key={testcase.id} value={testcase.id} className="text-base">
            #{index + 1} {testcase.name} {testcase.is_private ? "(Private)" : ""}
          </TabsTrigger>
        ))}
      </TabsList>
      {}
      {testcases.map((testcase, index) => (
        <TabsContent key={testcase.id} value={testcase.id}>
          {showDetails && (
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
          )}
          {/* OutputStep's inputs minus "public" */}
          {!showDetails && testcaseOutputSteps[index] && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Expected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testcaseOutputSteps[index].inputs.map((socket) => (
                  <TableRow key={socket.id}>
                    <TableCell>{socket.label}</TableCell>
                    <TableCell>
                      {socket.comparison
                        ? `${socket.comparison?.operator} ${JSON.stringify(socket.comparison?.value)}`
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
};

export default TestcaseTabs;
