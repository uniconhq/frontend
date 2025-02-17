import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { MiniGroupPublic, SubmissionPublic, UserPublic } from "@/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAllProjectSubmissions } from "@/features/problems/queries";
import { useProjectId } from "@/features/projects/hooks/use-id";
import { getProjectById } from "@/features/projects/queries";
import SubmissionsTable from "@/features/projects/table/submissions/submissions-table";

const getUsersFromSubmissions = (submissions: SubmissionPublic[]) => {
  const userIds = new Set(submissions.map((submission) => submission.user_id));
  const userMap = new Map<number, UserPublic>();
  submissions.forEach((submission) => {
    userMap.set(submission.user_id, submission.user);
  });
  return Array.from(userIds)
    .map((userId) => userMap.get(userId)!)
    .sort((a, b) => a.username.localeCompare(b.username));
};

const getGroupsFromSubmissions = (submissions: SubmissionPublic[]) => {
  const groupIds = new Set(
    submissions.flatMap((submission) => submission.user.group_members.map((group_member) => group_member.group.id)),
  );
  const groupMap = new Map<number, MiniGroupPublic>();
  for (const submission of submissions) {
    for (const group_member of submission.user.group_members) {
      groupMap.set(group_member.group.id, group_member.group);
    }
  }
  return Array.from(groupIds)
    .map((groupId) => groupMap.get(groupId)!)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const Submissions = () => {
  const projectId = useProjectId();
  const { data: project } = useQuery(getProjectById(Number(projectId)));
  const { data: submissions, isLoading } = useQuery(getAllProjectSubmissions(projectId));
  const [userFilter, setUserFilter] = useState<number | null>(null);
  const [groupFilter, setGroupFilter] = useState<number | null>(null);
  const [problemFilter, setProblemFilter] = useState<number | null>(null);

  if (!project || !submissions) {
    return;
  }

  const showUser = project.view_others_submission || project.view_supervised_submission;

  const groups = getGroupsFromSubmissions(submissions);

  let filteredSubmissions = submissions;

  if (groupFilter) {
    filteredSubmissions = filteredSubmissions.filter((submission) =>
      submission.user.group_members.some((group_member) => group_member.group.id === groupFilter),
    );
  }
  const users = getUsersFromSubmissions(filteredSubmissions);
  if (userFilter) {
    filteredSubmissions = filteredSubmissions.filter((submission) => submission.user_id === userFilter);
  }
  if (problemFilter) {
    filteredSubmissions = filteredSubmissions.filter((submission) => submission.problem_id === problemFilter);
  }

  if (!project) {
    return;
  }

  return (
    <div className="flex w-full flex-col px-8 py-4">
      <h1 className="text-2xl font-semibold">Submissions</h1>
      <div className="mt-4 grid grid-cols-3 gap-4">
        {/* Problem Filter */}
        <Select onValueChange={(value) => setProblemFilter(value === "all" ? null : Number(value))}>
          <SelectTrigger className="border border-border bg-zinc-800">
            <SelectValue placeholder="Filter by problem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All problems</SelectItem>
            {project.problems.map((problem) => (
              <SelectItem key={problem.id} value={problem.id.toString()}>
                {problem.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Group filter */}
        {showUser && (
          <Select
            onValueChange={(value) => {
              setGroupFilter(value === "all" ? null : Number(value));
              if (value !== "all") {
                setUserFilter(null);
              }
            }}
          >
            <SelectTrigger className="border border-border bg-zinc-800">
              <SelectValue placeholder="Filter by group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id.toString()}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* User filter */}
        {showUser && (
          <Select
            value={userFilter?.toString() || "all"}
            onValueChange={(value) => setUserFilter(value === "all" ? null : Number(value))}
          >
            <SelectTrigger className="border border-border bg-zinc-800">
              <SelectValue placeholder="Filter by user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id.toString()}>
                  {user.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="mt-8">
        {!isLoading && submissions && <SubmissionsTable data={filteredSubmissions} showUser={showUser} />}
      </div>
    </div>
  );
};

export default Submissions;
