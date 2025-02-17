import { useQuery } from "@tanstack/react-query";
import { SubmitHandler } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { MultipleChoiceTask } from "@/api";
import { getProblemById, useCreateTask } from "@/features/problems/queries";
import { useProblemId, useProjectId } from "@/features/projects/hooks/use-id";
import MultipleChoiceForm from "@/features/tasks/forms/multiple-choice-form";
import { MultipleChoiceFormT } from "@/lib/schema/multi-choice-form";
import { Unauthorized } from "@/pages/error";

const CreateMultipleChoice = () => {
  const problemId = useProblemId();
  const projectId = useProjectId();

  const createTaskMutation = useCreateTask(problemId);
  const navigate = useNavigate();

  const { data } = useQuery(getProblemById(problemId));
  if (data && !data.edit) {
    throw Unauthorized;
  }

  const onSubmit: SubmitHandler<MultipleChoiceFormT> = async (data) => {
    createTaskMutation.mutate(
      {
        ...data,
        choices: data.choices.map((choice, index) => ({
          ...choice,
          order_index: index,
        })),
        type: "MULTIPLE_CHOICE_TASK",
        id: -1,
      } as Omit<MultipleChoiceTask, "order_index">,
      {
        onSuccess: () => {
          navigate(`/projects/${projectId}/problems/${problemId}/edit`);
        },
      },
    );
  };

  return <MultipleChoiceForm onSubmit={onSubmit} title="New multiple choice task" />;
};

export default CreateMultipleChoice;
