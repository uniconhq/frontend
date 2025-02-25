import { DraggableProvided } from "@hello-pangea/dnd";
import { GripVertical, Pencil, Trash } from "lucide-react";
import { Link } from "react-router-dom";

import { TaskAttemptPublic } from "@/api";
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
  canEdit: boolean;
  canSubmit: boolean;
  submissionAttempt?: TaskAttemptPublic;
  provided?: DraggableProvided;
};

const TaskCard: React.FC<OwnProps> = ({
  index,
  task,
  problemId,
  projectId,
  canEdit,
  canSubmit,
  submissionAttempt,
  provided,
}) => {
  const deleteTaskMutation = useDeleteTask(problemId, task.id);
  return (
    <Card className="bg-inherit" {...(provided?.draggableProps ?? {})} ref={provided?.innerRef}>
      <CardHeader>
        <CardTitle
          className="-mx-6 -mt-6 flex items-center justify-between rounded-t-xl bg-neutral-800 px-6 pb-4 pt-4"
          {...(provided?.dragHandleProps ?? {})}
        >
          <div className="flex items-center gap-4">
            {canEdit && <GripVertical className="-mr-2" />}
            <span className="text-lg font-medium">Task #{index + 1}</span>
            <div className="flex items-center gap-2">
              <TaskTypeBadge type={task.type} />
              {task.autograde && <AutogradedBadge />}
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" className="hover:text-purple-300">
                <Link to={`/projects/${projectId}/problems/${problemId}/edit/tasks/${task.id}`}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
              <ConfirmationDialog onConfirm={deleteTaskMutation.mutate}>
                <Button type="button" variant={"destructive"}>
                  <Trash />
                  Delete
                </Button>
              </ConfirmationDialog>
            </div>
          )}
        </CardTitle>
        <CardContent className="p-0 py-2">
          <Task
            problemId={problemId}
            task={task}
            canEdit={canEdit}
            canSubmit={canSubmit}
            submissionAttempt={submissionAttempt}
          />
        </CardContent>
      </CardHeader>
    </Card>
  );
};
export default TaskCard;
