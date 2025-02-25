import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { getSubmissionById } from "@/features/problems/queries";

import Problem from "./problems/problem";

const SubmissionResults = () => {
  const { submissionId: id } = useParams<{ submissionId: string }>();

  const [pending, setPending] = useState(true);

  const { data: submission } = useQuery({
    ...getSubmissionById(Number(id)),
    refetchInterval: pending ? 5000 : false,
  });

  const task_attempts = submission?.task_attempts.sort((a, b) => a.task.order_index - b.task.order_index);

  useEffect(() => {
    const hasPendingResults =
      task_attempts?.some((attempt) => attempt.task_results.some((result) => result.status === "PENDING")) ?? false;
    setPending(hasPendingResults);
  }, [task_attempts, pending]);

  const problemId = submission?.problem_id;
  if (!submission || !problemId) return null;

  return (
    <Problem
      id={problemId}
      submissionId={parseInt(id!)}
      submissionAttempts={task_attempts}
      submittedAt={submission.submitted_at ?? undefined}
    />
  );
};

export default SubmissionResults;
