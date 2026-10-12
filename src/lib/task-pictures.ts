/**
 * A task's own pictures: the files under its `public/` folder, which a
 * statement shows by naming them as `public/diagram.png` or
 * `./public/diagram.png`. The backend serves each to whoever may read the
 * statement, from the task's latest publication, so a statement draws its
 * own pictures and nothing from a host its author picked.
 */
export type TaskWhere = { org: string; contest: string; task: string };

const PUBLIC = /^(?:\.\/)?public\/(.+)$/;

/**
 * The path under `public/` an image's address names, its parts decoded, or
 * null for any other address: one with a scheme, a host, a query or a
 * fragment, one outside `public/`, or one with an empty, `.` or `..` part,
 * which the backend would refuse anyway.
 */
export function publicPathOf(src: string): string[] | null {
  const matched = PUBLIC.exec(src);
  if (matched === null) return null;
  const rest = matched[1] ?? '';
  if (/[?#\\]/.test(rest)) return null;
  const parts: string[] = [];
  for (const part of rest.split('/')) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      return null;
    }
    if (
      decoded === '' ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/')
    ) {
      return null;
    }
    parts.push(decoded);
  }
  return parts;
}

/**
 * Where the picture an image's address names is read from, at the task's
 * own route, or null when the address is not one of the task's pictures.
 */
export function taskPictureHref(where: TaskWhere, src: string): string | null {
  const parts = publicPathOf(src);
  if (parts === null) return null;
  const part = encodeURIComponent;
  return [
    '/api/v1/orgs',
    part(where.org),
    'contests',
    part(where.contest),
    'tasks',
    part(where.task),
    'public',
    ...parts.map(part),
  ].join('/');
}
