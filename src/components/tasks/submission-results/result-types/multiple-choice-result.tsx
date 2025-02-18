import { Choice, MultipleChoiceTaskResult, TaskAttemptPublic } from "@/api";

import SubmittedChoices from "./submitted-choices";

type OwnProps = {
  taskAttempt: TaskAttemptPublic;
};

const MultipleChoiceResult: React.FC<OwnProps> = ({ taskAttempt }) => {
  const taskResults = taskAttempt.task_results as MultipleChoiceTaskResult[];
  const taskResult = taskResults[0];

  if (!taskResult || taskResult.result === null) {
    return null;
  }

  const choices = taskAttempt.task.other_fields?.choices as unknown as Choice[];
  const chosenAnswerId = taskAttempt.other_fields.user_input as string;
  const correctAnswerId = taskAttempt.task.other_fields?.expected_answer as string;

  return (
    <SubmittedChoices
      choices={choices.map((choice) => ({
        text: choice.text,
        isCorrect: correctAnswerId === choice.id,
        wasChosen: chosenAnswerId === choice.id,
      }))}
    />
  );
};

export default MultipleChoiceResult;
