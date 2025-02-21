import { DragDropContext, Draggable, Droppable, OnDragEndResponder } from "@hello-pangea/dnd";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TaskType } from "@/features/problems/queries";
import TaskCard from "@/features/tasks/components/task-card";

import CreateTaskPopover from "./create-task-popover";

export type Order = {
  id: number;
  orderIndex: number;
};

type OwnProps = {
  problemId: number;
  tasks: TaskType[];
  projectId: number;
  handleUpdateOrder: (newOrder: Order[]) => void;
};

const EditTasksDisplay: React.FC<OwnProps> = ({ tasks, problemId, projectId, handleUpdateOrder }) => {
  const onDragEnd: OnDragEndResponder<string> = ({ source, destination }) => {
    if (!destination) {
      return;
    }
    if (source.index === destination.index) {
      return;
    }

    const tasksCopy = [...tasks];
    const [removed] = tasksCopy.splice(source.index, 1);
    tasksCopy.splice(destination.index, 0, removed);
    handleUpdateOrder(tasksCopy.map((task, index) => ({ id: task.id, orderIndex: index })));
  };

  return (
    <div>
      <h2 className="min-w-[200px] text-lg font-medium">Tasks</h2>
      {tasks.length === 0 && (
        <div className="mt-4 rounded-sm bg-secondary p-4 text-center shadow-inner">
          You don't have any tasks.{" "}
          <CreateTaskPopover>
            <span className="text-purple-400 hover:text-purple-400/80">Create one?</span>
          </CreateTaskPopover>
        </div>
      )}
      {tasks.length > 0 && (
        <>
          <CreateTaskPopover>
            <Button variant="secondary" className="mt-2" type="button">
              <PlusIcon />
              Add task
            </Button>
          </CreateTaskPopover>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="tasks">
              {(provided) => (
                <div className="mt-4 flex flex-col gap-6" ref={provided.innerRef} {...provided.droppableProps}>
                  {tasks.map(
                    (task, index) =>
                      task && (
                        <Draggable draggableId={task.id.toString()} index={index} key={task.id}>
                          {(provided) => (
                            <TaskCard
                              index={index}
                              key={task.id}
                              task={task}
                              problemId={problemId}
                              projectId={projectId}
                              edit={true}
                              submit={false}
                              provided={provided}
                            />
                          )}
                        </Draggable>
                      ),
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </>
      )}
    </div>
  );
};

export default EditTasksDisplay;
