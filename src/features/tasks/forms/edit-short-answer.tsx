import { SubmitHandler } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { ShortAnswerTask } from "@/api";
import { useUpdateTask } from "@/features/problems/queries";
import { useProjectId } from "@/features/projects/hooks/use-id";
import ShortAnswerForm from "@/features/tasks/forms/short-answer-form";
import { ShortAnswerFormT } from "@/lib/schema/short-answer-form";

type OwnProps = {
  task: ShortAnswerTask;
  problemId: number;
};

const EditShortAnswer: React.FC<OwnProps> = ({ task, problemId }) => {
  const projectId = useProjectId();

  const updateTaskMutation = useUpdateTask(problemId, task.id);
  const navigate = useNavigate();

  const onSubmit: SubmitHandler<ShortAnswerFormT> = async (data) => {
    updateTaskMutation.mutate(
      {
        task: { ...task, ...data },
        // It is always safe (input is a string and remains compatible) to rerun a short answer task.
        rerun: true,
      },
      {
        onSuccess: () => {
          navigate(`/projects/${projectId}/problems/${problemId}/edit`);
        },
      },
    );
  };

  return (
    <ShortAnswerForm
      title="Edit Short Answer Task"
      onSubmit={onSubmit}
      initialValue={{ ...task, expected_answer: task.expected_answer ?? "" }}
    />
  );
};

export default EditShortAnswer;
