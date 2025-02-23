import { ProgrammingTask } from "@/api";
import Testcase from "@/features/problems/components/tasks/testcase";
import TaskContainer from "@/features/tasks/components/task-container";
import TaskSection from "@/features/tasks/components/task-section";
import TaskSectionHeader from "@/features/tasks/components/task-section-header";

import { ProgrammingEnvironment } from "./programming-environment";
import ProgrammingSubmitForm from "./programming-submit";

export function Programming({
  submit,
  edit,
  problemId,
  task,
}: {
  submit: boolean;
  edit: boolean;
  problemId: number;
  task: ProgrammingTask;
}) {
  return (
    <TaskContainer title={task.title} description={task.description}>
      <TaskSection>
        <TaskSectionHeader content="Environment" />
        <ProgrammingEnvironment environment={task.environment} />
      </TaskSection>
      <TaskSection>
        <TaskSectionHeader content="Testcases" />
        <div className="flex flex-col gap-2 font-mono text-gray-300">
          {task.testcases.map((testcase, index) => (
            <Testcase edit={false} key={testcase.id} index={index} testcase={testcase} taskFiles={task.files} />
          ))}
        </div>
      </TaskSection>
      {!edit && <ProgrammingSubmitForm problemId={problemId} task={task} submit={submit} />}
    </TaskContainer>
  );
}
