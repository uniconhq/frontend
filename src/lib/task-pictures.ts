/**
 * A statement shows only the task's own `public/` files, never a host its
 * author picked.
 */
export type TaskWhere = { org: string; contest: string; task: string };

const PUBLIC = /^(?:\.\/)?public\/(.+)$/;

/** Null for anything but a plain path under `public/`. */
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
