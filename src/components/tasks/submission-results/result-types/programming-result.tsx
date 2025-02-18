import { ProgrammingTask, ProgrammingTaskResult, TaskAttemptPublic } from "@/api";
import TestcaseResult from "@/components/tasks/submission-results/result-types/testcase-result";

type OwnProps = {
  taskAttempt: TaskAttemptPublic;
};

const ProgrammingResult: React.FC<OwnProps> = ({ taskAttempt }) => {
  const taskResult = taskAttempt.task_results[0] as unknown as ProgrammingTaskResult;

  if (taskResult.result === null) {
    return null;
  }

  const testcases = (taskAttempt.task.other_fields as ProgrammingTask).testcases;

  return (
    <div className="flex flex-col gap-1">
      {taskResult.result.map((testcaseResult, index) => (
        <TestcaseResult key={index} result={testcaseResult} index={index} testcase={testcases[index]} />
      ))}
    </div>
  );
};

export default ProgrammingResult;
