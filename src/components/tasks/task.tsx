import { MultipleChoiceTask, MultipleResponseTask, ProgrammingTask, ShortAnswerTask, TaskAttemptPublic } from "@/api";
import { MultipleChoice } from "@/components/tasks/multiple-choice";
import { MultipleResponse } from "@/components/tasks/multiple-response";
import { Programming } from "@/components/tasks/programming";
import { ShortAnswer } from "@/components/tasks/short-answer";

export function Task({
  problemId,
  task,
  canSubmit,
  canEdit,
  submissionAttempt,
}: {
  problemId: number;
  task: MultipleChoiceTask | MultipleResponseTask | ProgrammingTask | ShortAnswerTask;
  canSubmit: boolean;
  canEdit: boolean;
  submissionAttempt?: TaskAttemptPublic;
}) {
  // Based on the task type, render the appropriate component
  switch (task.type) {
    case "MULTIPLE_CHOICE_TASK":
      return <MultipleChoice task={task} />;
    case "MULTIPLE_RESPONSE_TASK":
      return <MultipleResponse task={task} />;
    case "SHORT_ANSWER_TASK":
      return <ShortAnswer task={task} />;
    case "PROGRAMMING_TASK":
      return (
        <Programming
          problemId={problemId}
          task={task}
          canSubmit={canSubmit}
          canEdit={canEdit}
          submissionAttempt={submissionAttempt}
        />
      );
    default:
      return <div className="font-mono text-red-400">Task type not supported</div>;
  }
}
