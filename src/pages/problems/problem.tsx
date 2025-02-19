import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { getProblemById } from "@/features/problems/queries";
import { useProblemId, useProjectId } from "@/features/projects/hooks/use-id";
import TaskCard from "@/features/tasks/components/task-card";
import { formatDateLong } from "@/utils/date";

const Problem = () => {
  const projectId = useProjectId();
  const id = useProblemId();
  const { data } = useQuery(getProblemById(id));
  const submitLink = `/projects/${projectId}/problems/${id}/submissions/new`;
  const editLink = `/projects/${projectId}/problems/${id}/edit`;

  if (!data) {
    return;
  }
  return (
    <div className="flex w-full flex-col gap-8 px-8 py-6">
      <div className="flex justify-between">
        <div>
          <h1 className="mb-4 flex items-center gap-4 text-2xl font-semibold">
            {data.name} (#{id}){" "}
            {data.restricted ? (
              <Badge variant={"destructive"}>restricted</Badge>
            ) : (
              <Badge variant={"secondary"} className="text-nowrap">
                not restricted
              </Badge>
            )}
            {!data.published && <Badge variant={"orange"}>draft</Badge>}
          </h1>
        </div>
        <div className="flex gap-1">
          {data.edit && (
            <Link to={editLink} className="flex gap-1">
              <Button variant="ghost" className="hover:text-purple-300">
                <Pencil /> Edit problem
              </Button>
            </Link>
          )}
          {data.make_submission && (
            <Link to={submitLink} className="flex gap-1">
              <Button variant="ghost" className="hover:text-purple-300">
                <Plus /> New Submission
              </Button>
            </Link>
          )}
        </div>
      </div>
      <Table>
        <TableRow>
          <TableHead>Starts at</TableHead>
          <TableCell>{formatDateLong(data.started_at)}</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>Ends at</TableHead>
          <TableCell>{formatDateLong(data.ended_at)}</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>Description</TableHead>
          <TableCell>{data.description}</TableCell>
        </TableRow>
      </Table>
      <div className="flex flex-col gap-8">
        {data?.tasks.map((task, index) => (
          <TaskCard
            index={index}
            key={task.id}
            task={task}
            problemId={id}
            projectId={projectId}
            edit={false}
            submit={data.make_submission}
          />
        ))}
      </div>
    </div>
  );
};

export default Problem;
