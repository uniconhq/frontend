import { ProgrammingTask, TaskAttemptPublic } from "@/api";
import TaskResultCard from "@/components/tasks/submission-results/task-result";
import TestcaseTabs from "@/features/problems/components/tasks/testcase-tabs";
import TaskContainer from "@/features/tasks/components/task-container";
import TaskSection from "@/features/tasks/components/task-section";
import TaskSectionHeader from "@/features/tasks/components/task-section-header";

import { ProgrammingEnvironment } from "./programming-environment";
import ProgrammingSubmitForm from "./programming-submit";

export function Programming({
  problemId,
  task,
  canSubmit,
  canEdit,
  submissionAttempt,
}: {
  problemId: number;
  task: ProgrammingTask;
  canSubmit: boolean;
  canEdit: boolean;
  submissionAttempt?: TaskAttemptPublic;
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
          <TestcaseTabs testcases={task.testcases} edit={false} taskFiles={task.files} />
        </div>
      </TaskSection>
      {!canEdit && !submissionAttempt && (
        <ProgrammingSubmitForm problemId={problemId} task={task} canSubmit={canSubmit} />
      )}
      {submissionAttempt && <TaskResultCard title="Submission" taskAttempt={submissionAttempt} problemId={problemId} />}
    </TaskContainer>
  );
}
