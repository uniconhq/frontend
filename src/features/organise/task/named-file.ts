import { useQuery } from '@tanstack/react-query';
import type { TreeEntry } from '@/api/types';
import { treeQuery } from '../files/place';
import type { TaskPlace } from './build-data';

function folderOf(path: string): string {
  const end = path.lastIndexOf('/');
  return end < 0 ? '' : path.slice(0, end);
}

/** The entry the setting names, or null when the task has none there. */
export function useNamed(place: TaskPlace, value: string) {
  const folder = value.endsWith('/');
  const path = folder ? value.slice(0, -1) : value;
  const read = useQuery({
    ...treeQuery(place, folderOf(path)),
    enabled: value !== '',
    retry: false,
  });
  const entry: TreeEntry | null | undefined =
    value === ''
      ? null
      : read.isPending
        ? undefined
        : read.data === undefined
          ? null
          : (read.data.find((found) => found.path === path) ?? null);
  return entry;
}
