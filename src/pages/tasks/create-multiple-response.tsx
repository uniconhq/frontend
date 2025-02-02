import { useQuery } from "@tanstack/react-query";
import { SubmitHandler } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { MultipleResponseTask } from "@/api";
import { getProblemById, useCreateTask } from "@/features/problems/queries";
import { useProblemId, useProjectId } from "@/features/projects/hooks/use-id";
import MultipleResponseForm, {
  MultipleResponseFormType,
} from "@/features/tasks/forms/multiple-response-form";

import { Unauthorized } from "../error";

const CreateMultipleResponse = () => {
  const problemId = useProblemId();
  const projectId = useProjectId();

  const createTaskMutation = useCreateTask(problemId);
  const navigate = useNavigate();

  const { data } = useQuery(getProblemById(problemId));
  if (data && !data.edit) {
    throw Unauthorized;
  }

  const onSubmit: SubmitHandler<MultipleResponseFormType> = async (data) => {
    createTaskMutation.mutate(
      {
        ...data,
        choices: data.choices.map((choice, index) => ({
          id: index,
          order_index: index,
          text: choice,
        })),
        type: "MULTIPLE_RESPONSE_TASK",
        id: -1,
      } as Omit<MultipleResponseTask, "order_index">,
      {
        onSuccess: () => {
          navigate(`/projects/${projectId}/problems/${problemId}/edit`);
        },
      },
    );
  };

  return <MultipleResponseForm onSubmit={onSubmit} />;
};

export default CreateMultipleResponse;
