import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import TaskResult from "@/components/tasks/submission-results/task-result";
import { Button } from "@/components/ui/button";
import { getSubmissionById } from "@/features/problems/queries";
import { useProjectId } from "@/features/projects/hooks/use-id";

const SubmissionResults = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = useProjectId();

  const [pending, setPending] = useState(true);

  const { data: submission } = useQuery({
    ...getSubmissionById(Number(id)),
    refetchInterval: pending ? 5000 : false,
  });

  const task_attempts = submission?.task_attempts.sort((a, b) => a.task.order_index - b.task.order_index);

  useEffect(() => {
    if (
      task_attempts &&
      pending &&
      task_attempts.every(
        (task_attempt) => task_attempt.task_results.length == 0 || task_attempt.task_results[0]?.status !== "PENDING",
      )
    ) {
      setPending(false);
    }
  }, [task_attempts, pending]);

  const contest_id: number = task_attempts ? task_attempts[0]?.task?.problem_id : 0;

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Submission (#{id})</h1>
        <Link to={`/projects/${projectId}/problems/${contest_id}`}>
          <Button variant="outline" className="font-mono text-sm hover:text-purple-500">
            CONTEST #{contest_id}
          </Button>
        </Link>
      </div>
      <div className="flex flex-col gap-8">
        {task_attempts?.map(
          (task_attempt) =>
            task_attempt.task_results.length > 0 && (
              <TaskResult
                key={task_attempt.id}
                title={`Task #${task_attempt.task_id + 1}`}
                taskAttempt={task_attempt}
              />
            ),
        )}
      </div>
    </div>
  );
};

export default SubmissionResults;
