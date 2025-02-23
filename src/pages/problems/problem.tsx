import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import ConfirmationDialog from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { DraftBadge, RestrictedBadge } from "@/features/problems/components/badges";
import { getProblemById, useCreateProblemSubmission } from "@/features/problems/queries";
import { useProblemId, useProjectId } from "@/features/projects/hooks/use-id";
import TaskCard from "@/features/tasks/components/task-card";
import { cn } from "@/lib/utils";

interface TimelineVizProps {
  startDate: Date;
  endDate: Date;
}

export function TimelineViz({ startDate, endDate }: TimelineVizProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const now = new Date();
    const total = endDate.getTime() - startDate.getTime();
    const current = now.getTime() - startDate.getTime();

    // Calculate progress percentage
    const progressPercent = Math.max(0, Math.min(100, (current / total) * 100));
    setProgress(progressPercent);
  }, [startDate, endDate]);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="absolute h-full rounded-r-full bg-purple-400" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex justify-between">
        <TimelineDate date={startDate} position="start" />
        <TimelineDate date={endDate} position="end" />
      </div>
    </div>
  );
}

function TimelineDate({ date, position }: { date: Date; position: "start" | "end" }) {
  return (
    <div className={cn("grid gap-0.5 text-sm text-muted-foreground", position === "end" && "text-right")}>
      <span className="font-light capitalize">{position}</span>
      <span className="font-medium">{format(date, "MMMM d, HH:mm")}</span>
    </div>
  );
}

const Problem = () => {
  const projectId = useProjectId();
  const problemId = useProblemId();
  const navigate = useNavigate();
  const createSubmission = useCreateProblemSubmission(problemId);

  const { data: problem } = useQuery(getProblemById(problemId));
  if (!problem) return;
  const { edit: canEdit, make_submission: canSubmit, restricted, published, started_at, ended_at } = problem;

  const handleSubmit = async () => {
    createSubmission.mutate(undefined, {
      onSuccess: (response) => {
        navigate(`/projects/${projectId}/submissions/${response.data?.id}`);
      },
    });
  };

  return (
    <div className="flex flex-col gap-8 px-8 py-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-4 text-3xl font-medium">
          <span>
            {problem.name} (<code>#{problemId}</code>)
          </span>
          {restricted && <RestrictedBadge />}
          {!published && <DraftBadge />}
        </h1>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link to={`/projects/${projectId}/problems/${problemId}/edit`}>
              <Button variant="outline">
                <Pencil /> Edit problem
              </Button>
            </Link>
          )}
          {canSubmit && (
            <ConfirmationDialog
              onConfirm={handleSubmit}
              title="Confirm Submission"
              description="Are you sure you want to submit?"
            >
              <Button variant="primary">Submit</Button>
            </ConfirmationDialog>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="text-lg font-medium">Timeline</div>
        <div className="xl:w-1/3">
          <TimelineViz startDate={parseISO(started_at)} endDate={parseISO(ended_at)} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-lg font-medium">Description</div>
        <p className="text-muted-foreground">Add 2 integers (error propagation)</p>
      </div>
      <div className="flex flex-col gap-8">
        {problem.tasks.map((task, index) => (
          <TaskCard
            index={index}
            key={task.id}
            task={task}
            problemId={problemId}
            projectId={projectId}
            edit={false}
            submit={canSubmit}
          />
        ))}
      </div>
    </div>
  );
};

export default Problem;
