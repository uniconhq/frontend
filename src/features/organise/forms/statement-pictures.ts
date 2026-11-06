import { publicPathOf } from '@/lib/task-pictures';
import type { Pictures } from '@/api/types';
import { formatLimit } from '@/lib/size';

/**
 * Why a file chosen cannot be a statement's picture, in words, or null when
 * it can, by the limits the server gives with the task.
 */
export function pictureRefusal(file: File, pictures: Pictures): string | null {
  const dot = file.name.lastIndexOf('.');
  const ending = dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase();
  if (!pictures.endings.includes(ending)) {
    return `${file.name} is not a picture this page can show. Choose a file ending in ${picturesAllowed(pictures)}.`;
  }
  if (file.size > pictures.most) {
    return `${file.name} is larger than ${formatLimit(pictures.most)}, the most a picture may be. Make it smaller first.`;
  }
  return null;
}

/** The endings allowed, in words: ".png, .jpg or .svg". */
export function picturesAllowed(pictures: Pictures): string {
  const named = pictures.endings.map((ending) => `.${ending}`);
  const last = named.pop();
  if (last === undefined) return 'none';
  return named.length === 0 ? last : `${named.join(', ')} or ${last}`;
}

/**
 * A change to the statement's pictures waiting for its save: a picture
 * chosen, with the line that shows it and an address that draws it from its
 * own bytes meanwhile, or one under `public/` to take out, with its token.
 */
export type StagedPicture =
  | { kind: 'add'; name: string; file: File; line: string; url: string }
  | { kind: 'remove'; name: string; token: string };

const IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/g;

/** The names under `public/` the text shows as pictures. */
export function picturesNamed(text: string): Set<string> {
  const named = new Set<string>();
  for (const found of text.matchAll(IMAGE)) {
    const parts = publicPathOf(found[1] ?? '');
    if (parts !== null) named.add(parts.join('/'));
  }
  return named;
}
