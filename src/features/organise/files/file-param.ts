/**
 * The open file is the `file` search parameter of the contest or task page,
 * so a link to a file works. Slashes stay readable; everything else a query
 * string would misread is encoded.
 */
export const FILE_PARAM = 'file';

export function fileHref(path: string): string {
  return `?${FILE_PARAM}=${encodeURIComponent(path).replaceAll('%2F', '/')}`;
}
