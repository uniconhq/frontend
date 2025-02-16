import React, { useState } from "react";
import { SubmitHandler } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { ProgrammingTask } from "@/api";
import { useUpdateTask } from "@/features/problems/queries";
import { useProjectId } from "@/features/projects/hooks/use-id";
import ProgrammingForm from "@/features/tasks/forms/programming-form";
import {
  fromProgrammingTask,
  ProgTaskForm,
  toProgrammingTask,
} from "@/lib/schema/prog-task-form";
import { isSafeChangeForProgrammingTask } from "@/utils/task";

import RerunDialog from "./rerun-dialog";

type OwnProps = {
  task: ProgrammingTask;
  problemId: number;
};

const EditProgramming: React.FC<OwnProps> = ({ task, problemId }) => {
  const projectId = useProjectId();

  const updateTaskMutation = useUpdateTask(problemId, task.id);
  const navigate = useNavigate();
  const [openDialog, setOpenDialog] = useState(false);
  const [data, setData] = useState<ProgTaskForm | null>(null);
  const [isSafe, setIsSafe] = useState<boolean>(false);

  const updateTask = (form: ProgTaskForm) => (rerun: boolean) => {
    updateTaskMutation.mutate(
      {
        task: { ...task, ...toProgrammingTask(form) },
        rerun,
      },
      {
        onSuccess: () => {
          navigate(`/projects/${projectId}/problems/${problemId}/edit`);
        },
      },
    );
  };

  const onSubmit: SubmitHandler<ProgTaskForm> = async (form: ProgTaskForm) => {
    setOpenDialog(true);
    setData(data);
    setIsSafe(isSafeChangeForProgrammingTask(task, toProgrammingTask(form)));
  };

  return (
    <>
      {openDialog && data && (
        <RerunDialog
          isSafe={isSafe}
          onClose={() => setOpenDialog(false)}
          onSaveWithoutRerun={() => updateTask(data)(false)}
          onSaveWithRerun={() => updateTask(data)(true)}
        />
      )}
      <ProgrammingForm
        title="Edit programming task"
        onSubmit={onSubmit}
        initialValue={fromProgrammingTask(task)}
      />
    </>
  );
};

export default EditProgramming;
