import { useQuery } from "@tanstack/react-query";
import { SubmitHandler } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { getProblemById, useCreateTask } from "@/features/problems/queries";
import { useProblemId, useProjectId } from "@/features/projects/hooks/use-id";
import ProgrammingForm from "@/features/tasks/forms/programming-form";
import { ProgTaskForm, toProgrammingTask } from "@/lib/schema/prog-task-form";

import { Unauthorized } from "../error";

const CreateProgramming = () => {
  const [problemId, projectId] = [useProblemId(), useProjectId()];

  const navigate = useNavigate();
  const createTaskMutation = useCreateTask(problemId);

  const { data } = useQuery(getProblemById(problemId));
  if (data && !data.edit) throw Unauthorized;

  const onSubmit: SubmitHandler<ProgTaskForm> = async (form) => {
    createTaskMutation.mutate(toProgrammingTask(form), {
      onSuccess: () => {
        navigate(`/projects/${projectId}/problems/${problemId}/edit`);
      },
    });
  };

  return <ProgrammingForm title="New Programming Task" onSubmit={onSubmit} />;
};

export default CreateProgramming;
