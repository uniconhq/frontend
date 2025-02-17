import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { RolePublicWithInvitationKeys } from "@/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { getProjectById, useUpdateRoles } from "../../queries";

type OwnProps = {
  projectId: number;
  data: RolePublicWithInvitationKeys[];
};

const keys: (keyof RolePublicWithInvitationKeys)[] = [
  "view_problems_access",
  "create_problems_access",
  "edit_problems_access",
  "delete_problems_access",
  "view_restricted_problems_access",
  "edit_restricted_problems_access",
  "delete_restricted_problems_access",
  "make_submission_access",
  "view_own_submission_access",
  "view_supervised_submission_access",
  "view_others_submission_access",
  "view_groups_access",
  "create_groups_access",
  "edit_groups_access",
  "delete_groups_access",
];

const RolePermissionsTable: React.FC<OwnProps> = ({ data, projectId }) => {
  const [roles, setRoles] = useState(data);
  const onChange = (index: number, key: keyof RolePublicWithInvitationKeys) => {
    setRoles((prev) => {
      const newRoles = [...prev];
      newRoles[index] = {
        ...newRoles[index],
        [key]: !newRoles[index][key],
      };
      return newRoles;
    });
  };

  const { data: project } = useQuery(getProjectById(projectId));

  const updateRolesMutation = useUpdateRoles(projectId);

  const onSave = () => {
    updateRolesMutation.mutate(roles);
  };

  if (!project) {
    return;
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <Table className="rounded-md border">
        <TableHeader>
          <TableRow>
            <TableHead rowSpan={2} className="text-center">
              role
            </TableHead>
            <TableHead colSpan={4} className="border-l text-center">
              problems
            </TableHead>
            <TableHead colSpan={3} className="border-l text-center">
              restricted problems
            </TableHead>
            <TableHead colSpan={4} className="border-l text-center">
              submissions
            </TableHead>
            <TableHead colSpan={4} className="border-l text-center">
              groups
            </TableHead>
          </TableRow>
          <TableRow>
            {/* problems */}
            <TableHead className="border-l text-center">view</TableHead>
            <TableHead className="border-l text-center">create</TableHead>
            <TableHead className="border-l text-center">update</TableHead>
            <TableHead className="border-l text-center">delete</TableHead>
            {/* restricted problems */}
            <TableHead className="border-l text-center">view</TableHead>
            <TableHead className="border-l text-center">update</TableHead>
            <TableHead className="border-l text-center">delete</TableHead>
            {/* submissions */}
            <TableHead className="border-l text-center">create</TableHead>
            <TableHead className="border-l text-center">view own</TableHead>
            <TableHead className="border-l text-center">view supervised</TableHead>
            <TableHead className="border-l text-center">view all</TableHead>
            {/* groups */}
            <TableHead className="border-l text-center">view</TableHead>
            <TableHead className="border-l text-center">create</TableHead>
            <TableHead className="border-l text-center">update</TableHead>
            <TableHead className="border-l text-center">delete</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="align-center">
          {roles.map((role, index) => (
            <TableRow className="text-center" key={role.id}>
              <TableCell>{role.name}</TableCell>
              {keys.map((key) => (
                <TableCell key={key}>
                  <div className="flex justify-center">
                    <Checkbox
                      disabled={!project?.edit_roles}
                      checked={role[key] as boolean}
                      onCheckedChange={() => onChange(index, key)}
                    />
                  </div>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button onClick={onSave} disabled={!project?.edit_roles}>
        Save permissions
      </Button>
    </div>
  );
};

export default RolePermissionsTable;
