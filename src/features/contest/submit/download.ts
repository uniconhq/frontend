/**
 * Where one file of one of your own submissions downloads from: the download
 * door on this origin. The proxy in `deploy` asks the backend whether the file
 * is yours and then streams it from the forge, so a file of any size comes
 * back without passing through the platform, and a dropped download resumes.
 * Each part of the address is encoded on its own, so a name stays one segment.
 */
export function downloadHref(
  where: { org: string; contest: string; task: string; number: number },
  path: string,
): string {
  const parts = [where.org, where.contest, where.task, String(where.number)];
  return `/-/downloads/${[...parts, ...path.split('/')].map(encodeURIComponent).join('/')}`;
}

/**
 * A file's name as the page shows it: its path under its input's folder,
 * `files/<input>/`, so a file in a folder of its own, or one part of a
 * tuple, is told apart from another of the same last name.
 */
export function nameOf(path: string): string {
  const parts = path.split('/');
  if (parts[0] === 'files' && parts.length > 2) return parts.slice(2).join('/');
  return path.slice(path.lastIndexOf('/') + 1);
}
