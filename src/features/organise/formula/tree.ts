/**
 * A block tree as the forge stores it: a number is its exact text, a call is
 * `{block, ...inputs}`, and a leaf is one key (`value`, `text`, `run`, …).
 * `null` is the editor's `?`, which is not saved.
 */
export type Tree = string | null | { [key: string]: Tree | Tree[] | undefined };

/** A name as a formula writes it: each `-` as `_`. */
export function written(name: string): string {
  return name.replaceAll('-', '_');
}
