import { useQuery } from "@tanstack/react-query";
import { differenceInDays, differenceInHours, format, parseISO } from "date-fns";
import { AlarmClockIcon, CalendarIcon, LockKeyholeIcon, Pencil } from "lucide-react";
import React from "react";
import { Link, useNavigate } from "react-router-dom";

import ConfirmationDialog from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DraftBadge, RestrictedBadge } from "@/features/problems/components/badges";
import { getProblemById, useCreateProblemSubmission } from "@/features/problems/queries";
import { useProblemId, useProjectId } from "@/features/projects/hooks/use-id";
import TaskCard from "@/features/tasks/components/task-card";

const TimeDisplay = ({
  label,
  datetime,
  overColour,
  children,
}: {
  label: string;
  datetime: Date;
  overColour: string;
  children?: React.ReactNode;
}) => {
  const now = new Date();
  const isOver = datetime < now;
  return (
    <Tooltip>
      <TooltipTrigger asChild className="cursor-default">
        <div className="flex items-center gap-3 rounded-md bg-zinc-900 p-4">
          {children}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">{label}</span>
            <span className={`text-sm font-medium ${isOver ? overColour : "text-white"}`}>
              {format(datetime, "MMM d yyyy, hh:mm a")}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {isOver ? (
          <span>
            {differenceInDays(now, datetime)} day(s), {differenceInHours(now, datetime) % 24} hour(s) since
          </span>
        ) : (
          <span>
            {differenceInDays(datetime, now)} day(s), {differenceInHours(datetime, new Date()) % 24} hour(s) left
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

const Problem = () => {
  const projectId = useProjectId();
  const problemId = useProblemId();
  const navigate = useNavigate();
  const createSubmission = useCreateProblemSubmission(problemId);

  const { data: problem } = useQuery(getProblemById(problemId));
  if (!problem) return;
  const {
    edit: canEdit,
    make_submission: canSubmit,
    restricted,
    published,
    started_at,
    ended_at,
    closed_at,
    description,
  } = problem;

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
        <div className="flex w-1/2 items-center gap-2">
          {started_at && (
            <TimeDisplay label="Release Date" datetime={parseISO(started_at)} overColour="text-green-400">
              <CalendarIcon className="h-5 w-5" />
            </TimeDisplay>
          )}
          {ended_at && (
            <TimeDisplay label="Due Date" datetime={parseISO(ended_at)} overColour="text-red-400">
              <AlarmClockIcon className="h-5 w-5" />
            </TimeDisplay>
          )}
          {closed_at && (
            <TimeDisplay label="Lock Date" datetime={parseISO(closed_at)} overColour="text-orange-400">
              <LockKeyholeIcon className="h-5 w-5" />
            </TimeDisplay>
          )}
        </div>
      </div>
      {description.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-lg font-medium">Description</div>
          <p className="text-muted-foreground">{description}</p>
        </div>
      )}
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
