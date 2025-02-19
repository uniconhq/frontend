import { useQuery } from "@tanstack/react-query";

import { getProblemById } from "@/features/problems/queries";
import { useProblemId, useTaskId } from "@/features/projects/hooks/use-id";

import EditMultipleChoice from "../../features/tasks/forms/edit-multiple-choice";
import EditMultipleResponse from "../../features/tasks/forms/edit-multiple-response";
import EditProgramming from "../../features/tasks/forms/edit-programming";
import EditShortAnswer from "../../features/tasks/forms/edit-short-answer";
import { NotFound, Unauthorized } from "../error";

const EditTask = () => {
  const problemId = useProblemId();
  const taskId = useTaskId();

  const { data: problem, isLoading } = useQuery(getProblemById(problemId));
  if (problem && !problem.edit) throw Unauthorized;

  const task = problem?.tasks.find((task) => task.id === taskId);
  if (!isLoading && !task) {
    throw NotFound;
  }

  switch (task?.type) {
    case "SHORT_ANSWER_TASK":
      return task && <EditShortAnswer task={task} problemId={problemId} />;
    case "PROGRAMMING_TASK":
      return task && <EditProgramming task={task} problemId={problemId} />;
    case "MULTIPLE_CHOICE_TASK":
      return task && <EditMultipleChoice task={task} problemId={problemId} />;
    case "MULTIPLE_RESPONSE_TASK":
      return task && <EditMultipleResponse task={task} problemId={problemId} />;
  }
};

export default EditTask;
