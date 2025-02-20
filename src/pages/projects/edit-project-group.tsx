import { useQuery } from "@tanstack/react-query";
import { TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { GoPencil } from "react-icons/go";
import { useNavigate } from "react-router-dom";

import { MiniGroupMemberPublic, UserPublicWithRolesAndGroups } from "@/api";
import ConfirmationDialog from "@/components/confirmation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EditGroupDialog from "@/features/projects/components/edit-group-dialog";
import { useGroupId, useProjectId } from "@/features/projects/hooks/use-id";
import {
  getProjectById,
  getProjectGroupById,
  getProjectUsersById,
  useDeleteGroup,
  useUpdateGroup,
} from "@/features/projects/queries";
import { cn } from "@/lib/utils";

import { Unauthorized } from "../error";

const EditProjectGroup = () => {
  const projectId = useProjectId();
  const groupId = useGroupId();
  const { data: project, isLoading } = useQuery(getProjectById(projectId));
  const { data: group, isLoading: isLoadingGroup } = useQuery(getProjectGroupById(projectId, groupId));
  const { data: users, isLoading: isLoadingUsers } = useQuery(getProjectUsersById(projectId));

  if (project && !project.edit_groups) throw Unauthorized;

  const userMap = new Map<number, UserPublicWithRolesAndGroups>();
  users?.forEach((user) => userMap.set(user.id, user));

  const [usersInGroup, setUsersInGroup] = useState([] as MiniGroupMemberPublic[]);
  const [hideUsersInOtherGroups, setHideUsersInOtherGroups] = useState(true);

  useEffect(() => {
    if (group && group.members) {
      setUsersInGroup(group.members);
    }
  }, [group]);

  const updateGroupMutation = useUpdateGroup(projectId, groupId);
  const deleteGroupMutation = useDeleteGroup(projectId, groupId);
  const navigate = useNavigate();

  if (isLoading || isLoadingGroup || isLoadingUsers) {
    return <div>Loading...</div>;
  }

  if (!project || !group || !users) {
    return <div>Something went wrong.</div>;
  }

  const usersNotInGroup = users.filter((user) => !usersInGroup.some((member) => member.user.id === user.id));

  const onSave = () => {
    updateGroupMutation.mutate({
      ...group,
      members: usersInGroup.filter((member) => !member.is_supervisor).map((member) => member.user.id),
      supervisors: usersInGroup.filter((member) => member.is_supervisor).map((member) => member.user.id),
    });
  };

  const filteredUsersNotInGroup = hideUsersInOtherGroups
    ? usersNotInGroup.filter(
        (user) => user.group_members.filter((groupMember) => groupMember.group.id !== groupId).length === 0,
      )
    : usersNotInGroup;

  return (
    <div className="m-auto flex w-full flex-col gap-8 p-4 px-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{group.name}</h2>
        <div className="flex gap-2">
          {project.create_groups && (
            <EditGroupDialog projectId={projectId} group={group}>
              <Button variant="ghost" className="hover:text-purple-300">
                <GoPencil /> Edit details
              </Button>
            </EditGroupDialog>
          )}

          {project.delete_groups && (
            <ConfirmationDialog
              description={`This will delete the group '${group.name}'and cannot be undone.`}
              onConfirm={() => {
                deleteGroupMutation.mutate(undefined, {
                  onSuccess: () => {
                    navigate(`/projects/${projectId}/groups`);
                  },
                });
              }}
            >
              <Button variant={"destructive"}>
                <TrashIcon />
              </Button>
            </ConfirmationDialog>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-xl font-[450]">Users that can be added</h3>
          <div className="mt-4 flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {filteredUsersNotInGroup?.map((user) => (
              <Card
                className={cn("cursor-pointer p-2", {
                  "bg-red-950": group.members.filter((member) => user.id === member.user.id).length > 0,
                })}
                onClick={() => {
                  setUsersInGroup([...usersInGroup, { user, is_supervisor: false }]);
                }}
              >
                <div className="flex items-center gap-2">
                  <Checkbox className="h-4 w-4" checked={false} />
                  {user.username} <Badge variant="secondary">{userMap.get(user.id)?.roles[0]?.name}</Badge>
                  {user.group_members.length > 0 && (
                    <span className="text-sm text-gray-500">
                      existing member of group(s): {user.group_members.map((group_member) => group_member.group.name)}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xl font-[450]">Users in group</h3>
          <div className="mt-4 flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {usersInGroup.map((groupMember) => (
              <Card
                className={cn("flex cursor-pointer items-center justify-between p-2", {
                  "bg-lime-950": group.members.filter((member) => groupMember.user.id === member.user.id).length === 0,
                })}
                onClick={() => {
                  setUsersInGroup(usersInGroup.filter((member) => member.user.id !== groupMember.user.id));
                }}
              >
                <div className="flex items-center gap-2">
                  <Checkbox className="h-4 w-4" checked />
                  {groupMember.user.username}
                  <Badge variant="secondary">{userMap.get(groupMember.user.id)?.roles[0]?.name}</Badge>
                </div>
                <Select
                  value={groupMember.is_supervisor ? "supervisor" : "member"}
                  onValueChange={(value) => {
                    setUsersInGroup(
                      usersInGroup.map((member) =>
                        member.user.id === groupMember.user.id
                          ? {
                              ...member,
                              is_supervisor: value === "supervisor",
                            }
                          : member,
                      ),
                    );
                  }}
                >
                  <SelectTrigger className="w-fit">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                  </SelectContent>
                </Select>
              </Card>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={hideUsersInOtherGroups}
          onCheckedChange={() => {
            setHideUsersInOtherGroups(!hideUsersInOtherGroups);
          }}
        />{" "}
        Hide users already part of another group
      </div>

      <div className="flex justify-end">
        <Button onClick={onSave}>Save changes</Button>
      </div>
    </div>
  );
};

export default EditProjectGroup;
