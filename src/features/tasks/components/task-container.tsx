import { PropsWithChildren } from "react";

import TaskSection from "@/features/tasks/components/task-section";
import TaskSectionHeader from "@/features/tasks/components/task-section-header";

type OwnProps = {
  title: string;
  description?: string | null;
};

type TaskContainerProps = OwnProps & PropsWithChildren;

const TaskContainer: React.FC<TaskContainerProps> = ({ title, description, children }) => {
  return (
    <div className="flex flex-col gap-6">
      <TaskSection>
        <TaskSectionHeader content="Title" />
        <span className="text-zinc-100">{title}</span>
      </TaskSection>
      {description && (
        <TaskSection>
          <TaskSectionHeader content="Description" />
          <p className="whitespace-pre-line text-sm text-zinc-100">{description}</p>
        </TaskSection>
      )}
      {children}
    </div>
  );
};

export default TaskContainer;
