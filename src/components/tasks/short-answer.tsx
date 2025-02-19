import { ShortAnswerTask } from "@/api";
import TaskContainer from "@/features/tasks/components/task-container";

export function ShortAnswer({ task }: { task: ShortAnswerTask }) {
  return <TaskContainer title={task.title} description={task.description} />;
}
