/**
 * A picture's name as a statement can write it in a link: letters, digits,
 * `.`, `_` and `-`, anything else a `-`, so `my diagram.png` is
 * `my-diagram.png`.
 */
export function pictureName(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf('.');
  const [stem, ending] =
    dot > 0 ? [trimmed.slice(0, dot), trimmed.slice(dot + 1)] : [trimmed, ''];
  const clean = (part: string) =>
    part.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '');
  const kept = clean(stem);
  const end = clean(ending);
  return `${kept === '' ? 'picture' : kept}${end === '' ? '' : `.${end}`}`;
}

/** A name under `public/` that no file has yet: `tree.png`, then `tree-2.png`. */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const [stem, ending] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let number = 2; ; number += 1) {
    const next = `${stem}-${String(number)}${ending}`;
    if (!taken.has(next)) return next;
  }
}

/** The line a statement shows a picture with: `![diagram](public/diagram.png)`. */
export function pictureLine(chosen: string, path: string): string {
  const alt = chosen
    .replace(/\.[^.]*$/, '')
    .replace(/[[\]]/g, '')
    .trim();
  return `![${alt === '' ? 'picture' : alt}](${path})`;
}
