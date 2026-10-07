/**
 * The open file is the `file` search parameter of the contest or task page,
 * so a link to a file works. Slashes stay readable; everything else a query
 * string would misread is encoded.
 */
export const FILE_PARAM = 'file';

/** The folder a path is in: `a/b/c.txt` is in `a/b`, and `c.txt` in the top one, "". */
export function folderOf(path: string | null): string {
  if (path === null) return '';
  const end = path.lastIndexOf('/');
  return end === -1 ? '' : path.slice(0, end);
}

export function fileHref(path: string): string {
  return `?${FILE_PARAM}=${encodeURIComponent(path).replaceAll('%2F', '/')}`;
}
