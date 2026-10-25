import { publicPathOf } from '@/lib/task-pictures';
import { formatLimit } from '@/lib/size';
import { exactJS, isRecord, parseYaml, writeAt, writeOver } from './yaml-doc';

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
const PICTURE_MOST = 10 * 1024 * 1024;

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

const LATER = ['after_close', 'on_release'] as const;

/**
 * The task's settings, `text`, with `scoring.show.now` showing each new
 * picture under `public/`, as the forge serves a file only while `show`
 * lists it or a folder it is in. It lists `public/`, unless a file there is
 * shown only later, which then stays so and each picture is listed alone.
 * Null when every picture is shown now already, or the settings cannot be read.
 */
export function showingPictures(text: string, names: readonly string[]): string | null {
  const parsed = parseYaml(text);
  if ('error' in parsed) return null;
  const root = exactJS(parsed.doc);
  if (!isRecord(root)) return null;
  const scoring = root['scoring'] ?? {};
  if (!isRecord(scoring)) return null;
  const show = scoring['show'] ?? {};
  if (!isRecord(show)) return null;
  const now = show['now'] ?? [];
  if (!Array.isArray(now)) return null;
  const listed = (entries: unknown) =>
    Array.isArray(entries)
      ? entries.filter((entry): entry is string => typeof entry === 'string')
      : [];
  const shownNow = (path: string) =>
    listed(now).some(
      (entry) => entry === path || (entry.endsWith('/') && path.startsWith(entry)),
    );
  const missing = names
    .map((name) => `public/${name}`)
    .filter((path) => !shownNow(path));
  if (missing.length === 0) return null;
  const later = LATER.some((when) =>
    listed(show[when]).some((entry) => entry.startsWith('public/')),
  );
  writeAt(
    parsed.doc,
    ['scoring', 'show', 'now'],
    [...(now as unknown[]), ...(later ? missing : ['public/'])],
  );
  return writeOver(text, parsed.doc);
}
