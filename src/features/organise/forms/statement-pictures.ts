import { publicPathOf } from '@/lib/task-pictures';
import { formatLimit } from '@/lib/size';

/**
 * The endings of the pictures a statement can show: the ones the backend
 * serves a task's `public/` file as a picture by; any other it serves as
 * bytes, which no page draws.
 */
const PICTURE_ENDINGS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'apng',
  'bmp',
  'ico',
  'svg',
]);

/** The most a picture under `public/` may be for a page to show it: the forge's limit. */
export const PICTURE_MOST = 10 * 1024 * 1024;

/** Why a file chosen cannot be a statement's picture, in words, or null when it can. */
export function pictureRefusal(file: File): string | null {
  const dot = file.name.lastIndexOf('.');
  const ending = dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase();
  if (!PICTURE_ENDINGS.has(ending)) {
    return `${file.name} is not a picture this page can show. Choose a PNG, JPEG, GIF, WebP, AVIF, APNG, BMP, ICO or SVG file.`;
  }
  if (file.size > PICTURE_MOST) {
    return `${file.name} is larger than ${formatLimit(PICTURE_MOST)}, the most a picture may be. Make it smaller first.`;
  }
  return null;
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
