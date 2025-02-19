import { useQuery } from "@tanstack/react-query";
import { SubmitHandler } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { getProblemById, useCreateTask } from "@/features/problems/queries";
import { useProblemId, useProjectId } from "@/features/projects/hooks/use-id";
import ShortAnswerForm from "@/features/tasks/forms/short-answer-form";
import { ShortAnswerFormT } from "@/lib/schema/short-answer-form";
import { Unauthorized } from "@/pages/error";

const CreateShortAnswer = () => {
  const problemId = useProblemId();
  const projectId = useProjectId();

  const createTaskMutation = useCreateTask(problemId);
  const navigate = useNavigate();

  const { data } = useQuery(getProblemById(problemId));
  if (data && !data.edit) throw Unauthorized;

  const onSubmit: SubmitHandler<ShortAnswerFormT> = async (data) => {
    createTaskMutation.mutate(
      {
        ...data,
        type: "SHORT_ANSWER_TASK",
        id: -1,
      },
      {
        onSuccess: () => {
          navigate(`/projects/${projectId}/problems/${problemId}/edit`);
        },
      },
    );
  };

  return <ShortAnswerForm onSubmit={onSubmit} title="New short answer task" />;
};

export default CreateShortAnswer;
