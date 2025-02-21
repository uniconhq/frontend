import { queryOptions } from "@tanstack/react-query";

import { getFile as apiGetFile } from "@/api";

export enum FileQueryKeys {
  File = "file",
}

export const getFile = (key: string) => {
  return queryOptions({
    queryKey: [FileQueryKeys.File, key],
    queryFn: () =>
      apiGetFile({ path: { file_id: key }, responseType: "blob" }).then((response) => {
        return response.data;
      }),
    staleTime: Infinity,
  });
};
