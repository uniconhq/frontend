import { Choice, MultipleResponseTaskResult, TaskAttemptPublic } from "@/api";

import SubmittedChoices from "./submitted-choices";

type OwnProps = {
  taskAttempt: TaskAttemptPublic;
};

const MultipleResponseResult: React.FC<OwnProps> = ({ taskAttempt }) => {
  const taskResults = taskAttempt.task_results as MultipleResponseTaskResult[];
  const taskResult = taskResults[0];

  if (!taskResult || taskResult.result === null) {
    return null;
  }

  const selectedChoices = taskResult?.result?.correct_choices.concat(taskResult.result?.incorrect_choices);

  return (
    <SubmittedChoices
      choices={(taskAttempt.task.other_fields?.choices as unknown as Choice[]).map((choice) => ({
        text: choice.text,
        wasChosen: selectedChoices.includes(choice.id),
        isCorrect: taskResult.result?.correct_choices.includes(choice.id) ?? false,
      }))}
    />
  );
};

export default MultipleResponseResult;
