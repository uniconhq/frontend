/** The first use of each end is `prints` or `reads`; a later one is named for the other end. */
export function linkRoles(programs: readonly string[], links: readonly string[]) {
  const names = new Set(programs);
  const writes = new Set<string>();
  const reads = new Set<string>();
  return links.map((link) => {
    const match = /^\s*([a-z][a-z0-9_]*)\s*->\s*([a-z][a-z0-9_]*)\s*$/.exec(link);
    const writer = match?.[1];
    const reader = match?.[2];
    if (
      writer === undefined ||
      reader === undefined ||
      writer === reader ||
      !names.has(writer) ||
      !names.has(reader)
    )
      return null;
    const out = writes.has(writer) ? `to_${reader}` : 'prints';
    const into = reads.has(reader) ? `from_${writer}` : 'reads';
    writes.add(writer);
    reads.add(reader);
    return { writer, reader, out, into };
  });
}
