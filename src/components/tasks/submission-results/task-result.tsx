import { TaskAttemptPublic } from "@/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import MultipleChoiceResult from "./result-types/multiple-choice-result";
import MultipleResponseResult from "./result-types/multiple-response-result";
import ProgrammingResult from "./result-types/programming-result";

type OwnProps = {
  title: string;
  taskAttempt: TaskAttemptPublic;
};

const taskStatusToColor = (status: string) => {
  switch (status) {
    case "PENDING":
      return "bg-yellow-400";
    case "SUCCESS":
      return "bg-green-400";
    case "SKIPPED":
      return "bg-gray-400";
  }
};

const parseDateTime = (dateTimeString: string) => new Date(dateTimeString).toLocaleString();

const TaskResultCard: React.FC<OwnProps> = ({ title, taskAttempt }) => {
  const taskResult = taskAttempt.task_results[0];

  if (!taskResult) {
    // TODO: Consider rendering something
    return;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-4 font-mono">
          <span className="relative flex h-4 w-4">
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full",
                taskStatusToColor(taskResult.status),
                taskResult.status === "PENDING" ? "animate-ping" : "",
              )}
            ></span>
            <span
              className={cn("absolute inline-flex h-4 w-4 rounded-full", taskStatusToColor(taskResult.status))}
            ></span>
          </span>
          <span className="text-lg font-medium">{title}</span>
        </CardTitle>
        {taskResult.status != "SKIPPED" && (
          <CardDescription className="flex flex-col gap-1 py-2 font-mono text-sm">
            <span>STARTED: {parseDateTime(taskResult.started_at)}</span>
            {taskResult.completed_at && <span>FINISHED: {parseDateTime(taskResult.completed_at)}</span>}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 font-mono">
        {taskResult.status == "SKIPPED" ? (
          <span className="text-gray-300">Manual grading is required!</span>
        ) : (
          <>
            {taskAttempt.task.type === "PROGRAMMING_TASK" && <ProgrammingResult taskAttempt={taskAttempt} />}
            {taskAttempt.task.type === "MULTIPLE_CHOICE_TASK" && <MultipleChoiceResult taskAttempt={taskAttempt} />}
            {taskAttempt.task.type === "SHORT_ANSWER_TASK" && (
              <pre className="whitespace-pre-wrap rounded-md bg-gray-900 p-4 text-gray-100">
                {JSON.stringify(taskResult.result, null, 2)}
              </pre>
            )}
            {taskAttempt.task.type === "MULTIPLE_RESPONSE_TASK" && <MultipleResponseResult taskAttempt={taskAttempt} />}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TaskResultCard;
