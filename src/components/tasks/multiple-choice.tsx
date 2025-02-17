import { MultipleChoiceTask } from "@/api";
import TaskContainer from "@/features/tasks/components/task-container";
import TaskSection from "@/features/tasks/components/task-section";
import TaskSectionHeader from "@/features/tasks/components/task-section-header";

export function MultipleChoice({ task }: { task: MultipleChoiceTask }) {
  return (
    <TaskContainer title={task.title} description={task.description}>
      <TaskSection>
        <TaskSectionHeader content="Choices" />
        <ul className="list-inside list-disc space-y-2">
          {task.choices.map((choice) => (
            <li key={choice.id}>{choice.text}</li>
          ))}
        </ul>
      </TaskSection>
    </TaskContainer>
  );
}
