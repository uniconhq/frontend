import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createOrganisation,
  createOrganisationInvitationKey,
  deleteMember,
  deleteOrganisation,
  deleteOrganisationInvitationKey,
  getAllOrganisations,
  getOrganisation,
  getOrganisationMembers,
  joinOrganisation,
  OrganisationCreate,
  OrganisationInvitationKeyCreate,
  OrganisationJoinRequest,
  OrganisationMemberUpdate,
  OrganisationUpdate,
  updateMember,
  updateOrganisation,
} from "@/api";

export enum OrganisationQueryKeys {
  Organisation = "Organisation",
  Member = "Member",
}
export const getOrganisations = () => {
  return queryOptions({
    queryKey: [OrganisationQueryKeys.Organisation],
    queryFn: () => getAllOrganisations().then((response) => response.data),
  });
};

export const getOrganisationById = (id: number) => {
  return queryOptions({
    queryKey: [OrganisationQueryKeys.Organisation, id],
    queryFn: () => getOrganisation({ path: { id } }).then((response) => response.data),
  });
};

export const useCreateOrganisation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OrganisationCreate) => createOrganisation({ body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [OrganisationQueryKeys.Organisation],
      });
    },
  });
};

export const useUpdateOrganisation = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OrganisationUpdate) => updateOrganisation({ path: { id }, body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [OrganisationQueryKeys.Organisation, id],
      });
    },
  });
};

export const useDeleteOrganisation = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      return deleteOrganisation({ path: { id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [OrganisationQueryKeys.Organisation],
      });
    },
  });
};

export const getOrganisationMembersById = (id: number) => {
  return queryOptions({
    queryKey: [OrganisationQueryKeys.Organisation, id, OrganisationQueryKeys.Member],
    queryFn: () => getOrganisationMembers({ path: { id } }).then((response) => response.data),
  });
};

export const useCreateOrganisationInvitationKey = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OrganisationInvitationKeyCreate) =>
      createOrganisationInvitationKey({ path: { id }, body: data }).then((response) => response.data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [OrganisationQueryKeys.Organisation, id, OrganisationQueryKeys.Member],
      });
    },
  });
};

export const useDeleteOrganisationInvitationKey = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keyId: number) => deleteOrganisationInvitationKey({ path: { id, key_id: keyId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [OrganisationQueryKeys.Organisation, id, OrganisationQueryKeys.Member],
      });
    },
  });
};

export const useJoinOrganisation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OrganisationJoinRequest) => joinOrganisation({ body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [OrganisationQueryKeys.Organisation],
      });
    },
  });
};

export const useUpdateMember = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { userId: number; updateData: OrganisationMemberUpdate }) =>
      updateMember({
        path: { id, user_id: data.userId },
        body: data.updateData,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [OrganisationQueryKeys.Organisation, id, OrganisationQueryKeys.Member],
      });
    },
  });
};

export const useDeleteMember = (id: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      deleteMember({
        path: {
          id,
          user_id: userId,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [OrganisationQueryKeys.Organisation, id, OrganisationQueryKeys.Member],
      });
    },
  });
};
