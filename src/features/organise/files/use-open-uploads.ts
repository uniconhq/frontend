import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  partUploadsQuery,
  readPartUpload,
  type MultipartPlace,
  type PartTransfer,
} from '@/api/upload/parts';

/**
 * The open uploads of a place, as Unfinished uploads lists them: the
 * server's list, and an upload that was finishing or refused when last read
 * kept once the list leaves it out, a finishing one read again to say how it
 * ended. Read again every 5 s while one is under way, and not read at all
 * while `enabled` is false.
 */
export function useOpenUploads(place: MultipartPlace, enabled = true) {
  const queryClient = useQueryClient();
  const options = partUploadsQuery(place);
  return useQuery({
    ...options,
    enabled,
    queryFn: async (context) => {
      const listed = await options.queryFn(context);
      const previous = queryClient.getQueryData<PartTransfer[]>(options.queryKey) ?? [];
      const missing = previous.filter(
        (row) =>
          (row.status === 'finishing' || row.status === 'refused') &&
          !listed.some((current) => current.id === row.id),
      );
      const finished = await Promise.all(
        missing.map(async (row) =>
          row.status === 'refused'
            ? row
            : readPartUpload(place, row.id, context.signal),
        ),
      );
      return [...listed, ...finished.filter((row) => row.status !== 'aborted')];
    },
    // Only an upload still under way changes without anyone here acting.
    refetchInterval: (query) =>
      query.state.data?.some(
        (row) => row.status === 'open' || row.status === 'finishing',
      )
        ? 5000
        : false,
  });
}
