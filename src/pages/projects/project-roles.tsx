import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import AddRoleDialog from "@/features/projects/components/add-role-dialog";
import { useProjectId } from "@/features/projects/hooks/use-id";
import { getProjectById, getProjectRolesById } from "@/features/projects/queries";
import RolePermissionsTable from "@/features/projects/table/roles/role-permissions-table";
import RolesTable from "@/features/projects/table/roles/roles-table";

const ProjectRoles = () => {
  const id = useProjectId();
  const { data: project, isLoading } = useQuery(getProjectById(Number(id)));
  const { data: roles, isLoading: isLoadingRoles, error } = useQuery(getProjectRolesById(id));

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!project) {
    return <div>Something went wrong.</div>;
  }

  if (error) {
    // If unauthorised, throw error to show <Error />.
    // There is a delay due to the retries by react query.
    throw error;
  }

  return (
    <div className="flex w-full flex-col gap-8 p-4 px-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Roles</h2>

        {project.add_roles && (
          <AddRoleDialog projectId={id}>
            <Button variant="ghost" className="hover:text-purple-300">
              <Plus /> New role
            </Button>
          </AddRoleDialog>
        )}
      </div>
      <div className="flex flex-col gap-8">
        {!isLoadingRoles && roles && (
          <>
            <div>
              <h3 className="mb-2 text-xl font-[450]">Permissions</h3>
              <RolePermissionsTable
                data={roles}
                projectId={id}
                // force rerender when a role is added
                key={roles.length}
              />
            </div>
            <div>
              <h3 className="mb-2 text-xl font-[450]">Invitation keys</h3>
              <RolesTable data={roles} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProjectRoles;
