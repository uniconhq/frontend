import { queryOptions } from "@tanstack/react-query";

import { getUser } from "@/api";

export enum UserQueryKeys {
  UserProfile = "user_profile",
}

export const getUserProfile = () => {
  return queryOptions({
    queryKey: [UserQueryKeys.UserProfile],
    queryFn: () => getUser({ withCredentials: true }).then((response) => response.data),
    retry: false,
  });
};
