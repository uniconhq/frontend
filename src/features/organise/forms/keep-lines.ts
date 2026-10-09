/**
 * An edit of a document laid over the file's own text. The library writes a
 * whole document again in its own way: a comment beside a key on a line of
 * its own, one space before a `#`, a flow `[]` as a block. So an edit is
 * found by comparing what the library writes before and after it, and only
 * those lines, with any line the library writes otherwise right beside them,
 * take the library's form; every other line stays as the file wrote it.
 */

/** A run of lines the file and the library's writing hold alike, or not. */
type Segment = { same: boolean; u0: number; u1: number; o0: number; o1: number };

/**
 * `changed`, the library's writing of the edited document, with every line
 * the edit did not reach as `original` wrote it. `unchanged` is the
 * library's writing of `original` before the edit. `reads` tells whether
 * two texts mean the same; when the laid-over text would mean anything but
 * what `changed` does, `changed` is given whole.
 */
export function overOriginal(
  original: string,
  unchanged: string,
  changed: string,
  reads: (a: string, b: string) => boolean,
): string {
  if (unchanged === changed) return original;
  if (original === unchanged) return changed;
  const o = original.split('\n');
  const u = unchanged.split('\n');
  const c = changed.split('\n');
  const uToO = matched(o, u);
  const uToC = matched(c, u);
  const segments = segmentsOf(uToO, o.length);
  const spans = spansOf(uToC, c.length, segments);

  const out: string[] = [];
  let at = 0;
  for (const [a, b] of spans) {
    out.push(...originalLines(o, segments, at, a));
    out.push(...c.slice(cAfter(uToC, a - 1), cAt(uToC, b, c.length)));
    at = b;
  }
  out.push(...originalLines(o, segments, at, u.length, true));
  const laid = out.join('\n');
  return reads(laid, changed) ? laid : changed;
}

/**
 * For each line of `b`, the line of `a` it is matched with in a longest
 * common run of lines, or -1.
 */
function matched(a: string[], b: string[]): number[] {
  const result = new Array<number>(b.length).fill(-1);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    result[start] = start;
    start += 1;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
    result[endB] = endA;
  }
  const n = endA - start;
  const m = endB - start;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1)
    for (let j = m - 1; j >= 0; j -= 1)
      table[i * width + j] =
        a[start + i] === b[start + j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      result[start + j] = start + i;
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0))
      i += 1;
    else j += 1;
  }
  return result;
}

/** The library's lines cut into runs it writes as the file does, and runs it does not. */
function segmentsOf(uToO: number[], oLength: number): Segment[] {
  const segments: Segment[] = [];
  let u = 0;
  let o = 0;
  while (u < uToO.length || o < oLength) {
    if (u < uToO.length && uToO[u] === o) {
      const u0 = u;
      const o0 = o;
      while (u < uToO.length && uToO[u] === o) {
        u += 1;
        o += 1;
      }
      segments.push({ same: true, u0, u1: u, o0, o1: o });
      continue;
    }
    const u0 = u;
    while (u < uToO.length && uToO[u] === -1) u += 1;
    const o1 = u < uToO.length ? (uToO[u] ?? oLength) : oLength;
    segments.push({ same: false, u0, u1: u, o0: o, o1 });
    o = o1;
  }
  return segments;
}

/**
 * The stretches of the library's lines, as boundaries `[a, b]`, that are
 * written as the edit leaves them: each change, grown over any run the
 * library writes otherwise that it touches, until neither end is inside a
 * change or such a run.
 */
function spansOf(
  uToC: number[],
  cLength: number,
  segments: Segment[],
): [number, number][] {
  const spans: [number, number][] = [];
  let kept = -1;
  for (let u = 0; u <= uToC.length; u += 1) {
    if (u < uToC.length && uToC[u] === -1) continue;
    const before = kept < 0 ? 0 : (uToC[kept] ?? 0) + 1;
    const after = u < uToC.length ? (uToC[u] ?? cLength) : cLength;
    if (u - kept > 1 || after > before) spans.push([kept + 1, u]);
    kept = u;
  }
  const others = segments.filter((segment) => !segment.same && segment.u1 > segment.u0);
  let grown = true;
  while (grown) {
    grown = false;
    for (const span of spans)
      for (const segment of others) {
        const [a, b] = span;
        const touches =
          a === b ? segment.u0 < a && a < segment.u1 : a < segment.u1 && b > segment.u0;
        if (touches && (segment.u0 < a || segment.u1 > b)) {
          span[0] = Math.min(a, segment.u0);
          span[1] = Math.max(b, segment.u1);
          grown = true;
        }
      }
    spans.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    for (let at = spans.length - 1; at > 0; at -= 1) {
      const previous = spans[at - 1];
      const span = spans[at];
      if (previous !== undefined && span !== undefined && previous[1] >= span[0]) {
        previous[1] = Math.max(previous[1], span[1]);
        spans.splice(at, 1);
        grown = true;
      }
    }
  }
  return spans;
}

/** The changed line after the library's line `u`, which the edit kept, or the first. */
function cAfter(uToC: number[], u: number): number {
  return u < 0 ? 0 : (uToC[u] ?? -1) + 1;
}

/** The changed line the library's line `u` became, or the end. */
function cAt(uToC: number[], u: number, cLength: number): number {
  return u < uToC.length ? (uToC[u] ?? cLength) : cLength;
}

/**
 * The file's own lines for the library's lines `[from, to)`, none of them
 * edited. Lines only the file holds go with the range that starts at them,
 * and those after the library's last line with the `last` range.
 */
function originalLines(
  o: string[],
  segments: Segment[],
  from: number,
  to: number,
  last = false,
): string[] {
  const lines: string[] = [];
  for (const segment of segments) {
    if (segment.same) {
      const start = Math.max(from, segment.u0);
      const end = Math.min(to, segment.u1);
      if (start < end)
        lines.push(
          ...o.slice(segment.o0 + start - segment.u0, segment.o0 + end - segment.u0),
        );
      continue;
    }
    const at = segment.u0;
    const inside =
      segment.u0 === segment.u1
        ? from <= at && (at < to || (last && at === to))
        : from <= segment.u0 && segment.u1 <= to;
    if (inside) lines.push(...o.slice(segment.o0, segment.o1));
  }
  return lines;
}
