/**
 * Data worked out afresh on every draw, with each part that did not change
 * kept as the very value it was, so `memo` and React Flow see a change only
 * in the parts that changed and draw again only those.
 */

function isPlain(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * `after`, with each part equal to the same part of `before` given as
 * `before`'s own: `before` itself when the two are equal all through. Only
 * plain objects and arrays are looked into; anything else is equal only to
 * itself.
 */
export function keepEqual<T>(before: unknown, after: T): T {
  if (Object.is(before, after)) return after;
  if (Array.isArray(before) && Array.isArray(after)) {
    const items = after as unknown[];
    const kept = items.map((item, at) => keepEqual(before[at], item));
    if (kept.length === before.length && kept.every((item, at) => item === before[at]))
      return before as T;
    return (kept.every((item, at) => item === items[at]) ? after : kept) as T;
  }
  if (isPlain(before) && isPlain(after)) {
    const kept: Record<string, unknown> = {};
    let same = Object.keys(before).length === Object.keys(after).length;
    let fresh = true;
    for (const [name, value] of Object.entries(after)) {
      kept[name] = keepEqual(before[name], value);
      same &&= name in before && kept[name] === before[name];
      fresh &&= kept[name] === value;
    }
    if (same) return before as T;
    return (fresh ? after : kept) as T;
  }
  return after;
}
