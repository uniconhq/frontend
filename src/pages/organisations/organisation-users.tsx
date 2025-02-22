import { useQuery } from "@tanstack/react-query";
import { Crown, EllipsisVertical } from "lucide-react";

import ConfirmationDialog from "@/components/confirmation-dialog";
import EmptyPlaceholder from "@/components/layout/empty-placeholder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getOrganisationMembersById,
  useCreateOrganisationInvitationKey,
  useDeleteMember,
  useDeleteOrganisationInvitationKey,
  useUpdateMember,
} from "@/features/organisations/queries";
import { useOrganisationId } from "@/features/projects/hooks/use-id";
import InvitationKeyDisplay from "@/features/projects/table/roles/invitation-key-display";

const OrganisationUsers = () => {
  const id = useOrganisationId();
  const { data, isLoading } = useQuery(getOrganisationMembersById(id));
  const createKeyMutation = useCreateOrganisationInvitationKey(id);
  const deleteKeyMutation = useDeleteOrganisationInvitationKey(id);
  const updateMemberMutation = useUpdateMember(id);
  const deleteMemberMutation = useDeleteMember(id);

  if (isLoading) {
    return <div>Loading</div>;
  }
  if (!data) {
    return <div>Something went wrong.</div>;
  }

  const admins = data.members.filter((member) => member.role === "admin");
  const observers = data.members.filter((member) => member.role === "observer");

  const adminInvitationKey = data.invitation_keys?.filter((key) => key.role === "admin")[0];
  const observerInvitationKey = data.invitation_keys?.filter((key) => key.role === "observer")[0];
  const canEditRoles = data.edit_roles;

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-6">
      <div className="text-2xl">
        Manage members for <span className="font-[450]">{data.name}</span>
      </div>
      <div className="flex flex-col gap-12">
        {/* Owner */}
        <div>
          <div className="text-xl font-semibold">Owner</div>
          <p className="text-slate-500">
            An owner has full permissions for the organisation and its projects, including managing member
            roles/invitations and transferring ownership.
          </p>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown />
              <div>{data.owner.username}</div>
            </div>
            <div className="text-gray-500">Owner</div>
          </div>
        </div>
        {/* Admin */}
        <div>
          <div className="text-xl font-semibold">Admins</div>
          <p className="text-slate-500">
            Admins can edit the organization and fully manage projects but cannot manage organization roles or delete
            the organization.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {admins.map((admin) => (
              <Card key={admin.user.id} className="flex items-center justify-between gap-2 px-4 py-2">
                <div>{admin.user.username}</div>
                <div className="flex items-center gap-2">
                  <div className="text-gray-500">Admin</div>
                  {canEditRoles && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="hover:text-purple-300">
                          <EllipsisVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() =>
                            updateMemberMutation.mutate({
                              userId: admin.user.id,
                              updateData: { role: "owner" },
                            })
                          }
                        >
                          Transfer Ownership
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            updateMemberMutation.mutate({
                              userId: admin.user.id,
                              updateData: { role: "observer" },
                            })
                          }
                        >
                          Downgrade to Observer
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => deleteMemberMutation.mutate(admin.user.id)}>
                          Remove Admin
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </Card>
            ))}
            {admins.length === 0 && <EmptyPlaceholder description="No admins found." />}
          </div>
          {canEditRoles && (
            <div className="mt-4 flex justify-between">
              <h3 className="text-lg">Admin invitation key</h3>
              {adminInvitationKey ? (
                <div className="flex items-center gap-2">
                  <InvitationKeyDisplay variant="border" invitationKey={adminInvitationKey.key} />
                  <ConfirmationDialog
                    onConfirm={() => deleteKeyMutation.mutate(adminInvitationKey.id)}
                    description="Are you sure you want to delete this invitation key?"
                  >
                    <Button variant="secondary">Delete</Button>
                  </ConfirmationDialog>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => createKeyMutation.mutate({ role: "admin" })}>
                  Generate new key
                </Button>
              )}
            </div>
          )}
        </div>
        {/* Observers */}
        <div>
          <div className="text-xl font-semibold">Observers</div>
          <p className="text-slate-500">Observers can view the organisation and its projects but cannot modify them.</p>
          <div className="mt-4 flex flex-col gap-2">
            {observers.map((observer) => (
              <Card key={observer.user.id} className="flex items-center justify-between gap-2 px-4 py-2">
                <div>{observer.user.username}</div>
                <div className="flex items-center gap-2">
                  <div className="text-gray-500">Observer</div>
                  {canEditRoles && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="hover:text-purple-300">
                          <EllipsisVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() =>
                            updateMemberMutation.mutate({
                              userId: observer.user.id,
                              updateData: { role: "owner" },
                            })
                          }
                        >
                          Transfer Ownership
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            updateMemberMutation.mutate({
                              userId: observer.user.id,
                              updateData: { role: "admin" },
                            })
                          }
                        >
                          Upgrade to Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => deleteMemberMutation.mutate(observer.user.id)}>
                          Remove Observer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </Card>
            ))}
            {observers.length === 0 && <EmptyPlaceholder description="No observers in the organisation." />}
          </div>
          {canEditRoles && (
            <div className="mt-4 flex justify-between">
              <h3 className="text-lg">Observer invitation key</h3>
              {observerInvitationKey ? (
                <div className="flex items-center gap-2">
                  <InvitationKeyDisplay variant="border" invitationKey={observerInvitationKey.key} />
                  <ConfirmationDialog
                    onConfirm={() => deleteKeyMutation.mutate(observerInvitationKey.id)}
                    description="Are you sure you want to delete this invitation key?"
                  >
                    <Button variant="secondary" onClick={() => deleteKeyMutation.mutate(observerInvitationKey.id)}>
                      Delete
                    </Button>
                  </ConfirmationDialog>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => createKeyMutation.mutate({ role: "observer" })}>
                  Generate new key
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrganisationUsers;
