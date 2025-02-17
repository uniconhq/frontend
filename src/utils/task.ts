import { Choice, ProgrammingTask } from "@/api";

export type ChoiceWithoutOrder = Omit<Choice, "order_index">;

export const normaliseChoices = (oldChoices: ChoiceWithoutOrder[], newChoices: ChoiceWithoutOrder[]) => {
  // If a new choice has the id of a deleted choice, keep the old id to maximise compatibility with existing attempts.
  const choices = newChoices.map((newChoice) => {
    const oldChoice = oldChoices.find((choice) => choice.text === newChoice.text);
    return oldChoice ? { ...newChoice, id: oldChoice.id } : newChoice;
  });
  return choices;
};

/*
We define the safety of a change based on its predicted unsafety on rerunning previous attempts.
*/
export const isSafeChoiceChange = (oldChoices: ChoiceWithoutOrder[], newChoices: ChoiceWithoutOrder[]) => {
  /*
  For MCQ and MRQ, deleting/adding a choice may be unfair to previous attempts since they
  may have already selected old ids OR not get to select the new choice.
  */
  const oldChoiceIds = oldChoices.map((choice) => choice.id);
  const newChoiceIds = newChoices.map((choice) => choice.id);
  return oldChoices.length === newChoices.length && newChoiceIds.every((id) => oldChoiceIds.includes(id));
};

export const isSafeChangeForProgrammingTask = (
  oldProgrammingTask: Pick<ProgrammingTask, "required_inputs" | "testcases">,
  newProgrammingTask: Pick<ProgrammingTask, "required_inputs" | "testcases">,
) => {
  /*
  For programming tasks, if the input format changed, we assume it is unsafe.
  */
  if (JSON.stringify(oldProgrammingTask.required_inputs) !== JSON.stringify(newProgrammingTask.required_inputs))
    return false;
  return true;
};
