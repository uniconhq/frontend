import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import AddGroupDialog from "@/features/projects/components/add-group-dialog";
import { useProjectId } from "@/features/projects/hooks/use-id";
import {
  getProjectById,
  getProjectGroupsById,
} from "@/features/projects/queries";

const ProjectGroups = () => {
  const id = useProjectId();
  const { data: project, isLoading } = useQuery(getProjectById(id));
  const { data: groups, isLoading: isLoadingGroups } = useQuery(
    getProjectGroupsById(id),
  );
  if (isLoading || isLoadingGroups) {
    return <div>Loading...</div>;
  }

  if (!project || !groups) {
    return <div>Something went wrong.</div>;
  }

  return (
    <div className="m-auto flex w-full flex-col gap-8 p-4 px-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Groups</h2>
        {project.create_groups && (
          <AddGroupDialog projectId={id}>
            <Button variant="ghost" className="hover:text-purple-300">
              <Plus /> New group
            </Button>
          </AddGroupDialog>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {groups.map((group) => (
          <Card className="p-4">
            <CardTitle className="p-2">
              <div className="flex justify-between">
                <div>
                  <h4 className="text-2xl font-[450]">
                    {group.name} (
                    {group.members.length + group.supervisors.length})
                  </h4>
                  <p className="text-sm font-normal text-gray-400">
                    {group.members.length} member
                    {group.members.length !== 1 && "s"},{" "}
                    {group.supervisors.length} supervisor
                    {group.supervisors.length !== 1 && "s"}
                  </p>
                </div>
                {project.edit_groups && (
                  <Button variant={"secondary"}>Edit group</Button>
                )}
              </div>
            </CardTitle>
            <CardContent className="p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>S/N</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.supervisors.map((member, index) => (
                    <TableRow key={member.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{member.username}</TableCell>
                      <TableCell>
                        <Badge variant={"green"}>Supervisor</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {group.members.map((member, index) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        {index + 1 + group.supervisors.length}
                      </TableCell>
                      <TableCell>{member.username}</TableCell>
                      <TableCell>
                        <Badge>Member</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {group.members.length + group.supervisors.length === 0 && (
                    <TableRow className="text-center">
                      <TableCell colSpan={3}>No members.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ProjectGroups;
