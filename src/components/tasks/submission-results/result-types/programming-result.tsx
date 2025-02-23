import { useQuery } from "@tanstack/react-query";

import { ProgrammingTask, ProgrammingTaskResult, TaskAttemptPublic } from "@/api";
import TestcaseResult from "@/components/tasks/submission-results/result-types/testcase-result";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProblemById } from "@/features/problems/queries";
import { useProblemId } from "@/features/projects/hooks/use-id";
import { cn } from "@/lib/utils";

type OwnProps = {
  taskAttempt: TaskAttemptPublic;
};

const ProgrammingResult: React.FC<OwnProps> = ({ taskAttempt }) => {
  const taskResult = taskAttempt.task_results[0] as unknown as ProgrammingTaskResult;

  const problemId = useProblemId();
  const { data: problem } = useQuery(getProblemById(problemId));

  if (taskResult.result === null || !problem) {
    return null;
  }

  const testcases = (taskAttempt.task.other_fields as ProgrammingTask).testcases;

  return (
    <div className="flex flex-col gap-1">
      <Tabs defaultValue={taskResult.result[0]?.id}>
        <TabsList>
          {taskResult.result.map((testcaseResult, index) => {
            const testcase = testcases[index];
            const passed = testcaseResult.status === "OK";
            return (
              <TabsTrigger value={testcaseResult.id} key={testcaseResult.id}>
                #{index + 1} {testcase.name} {testcase.is_private ? "(Private)" : ""}
                <span className={cn("ml-2", passed ? "text-green-400" : "text-red-400")}>{passed ? "✓" : "✗"}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
        {taskResult.result.map((testcaseResult, index) => (
          <TabsContent className="mt-4" value={testcaseResult.id} key={testcaseResult.id}>
            <TestcaseResult
              result={testcaseResult}
              index={index}
              testcase={testcases[index]}
              hideDetails={!problem.view_hidden_details}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default ProgrammingResult;
