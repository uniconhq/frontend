import { DraggableProvided } from "@hello-pangea/dnd";
import { GripVertical, Pencil, Trash } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import ConfirmationDialog from "@/components/confirmation-dialog";
import { Task } from "@/components/tasks/task";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskType, useDeleteTask } from "@/features/problems/queries";
import { AutogradedBadge, TaskTypeBadge } from "@/features/tasks/components/badges";

type OwnProps = {
  index: number;
  task: TaskType;
  problemId: number;
  projectId: number;
  edit: boolean;
  submit: boolean;
  provided?: DraggableProvided;
};

const TaskCard: React.FC<OwnProps> = ({ index, task, problemId, projectId, edit, submit, provided }) => {
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const deleteTaskMutation = useDeleteTask(problemId, task.id);
  const handleDelete = () => {
    deleteTaskMutation.mutate(undefined, {
      onSuccess: () => {
        setOpenDeleteDialog(false);
      },
    });
  };

  return (
    <>
      {openDeleteDialog && (
        <ConfirmationDialog
          description="Deleting this task and all its attempts is irreversible!"
          setOpen={setOpenDeleteDialog}
          onConfirm={handleDelete}
        />
      )}
      <Card className="bg-inherit" {...(provided?.draggableProps ?? {})} ref={provided?.innerRef}>
        <CardHeader>
          <CardTitle
            className="-mx-6 -mt-6 flex items-center justify-between rounded-t-xl bg-neutral-800 px-6 pb-4 pt-4"
            {...(provided?.dragHandleProps ?? {})}
          >
            <div className="flex items-center gap-4">
              {edit && <GripVertical className="-mr-2" />}
              <span className="text-lg font-medium">Task #{index + 1}</span>
              <div className="flex items-center gap-2">
                <TaskTypeBadge type={task.type} />
                {task.autograde && <AutogradedBadge />}
              </div>
            </div>
            {edit && (
              <div className="flex items-center gap-4">
                <Button asChild variant="ghost" className="hover:text-purple-300">
                  <Link to={`/projects/${projectId}/problems/${problemId}/edit/tasks/${task.id}`}>
                    <Pencil />
                    Edit
                  </Link>
                </Button>
                <Button type="button" variant={"destructive"} onClick={() => setOpenDeleteDialog(true)}>
                  <Trash />
                  Delete
                </Button>
              </div>
            )}
          </CardTitle>
          <CardContent className="p-0 py-2">
            <Task submit={submit && !edit} problemId={problemId} task={task} edit={edit} />
          </CardContent>
        </CardHeader>
      </Card>
    </>
  );
};
export default TaskCard;
