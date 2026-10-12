const KIB = 1024;
const MIB = KIB * KIB;

/** A size as a limit is written: whole MiB or KiB when it is one, else in B, as `formatSize` writes it. */
export function formatLimit(bytes: number): string {
  if (bytes >= MIB && bytes % MIB === 0) return `${bytes / MIB} MB`;
  if (bytes >= KIB && bytes % KIB === 0) return `${bytes / KIB} KB`;
  return `${bytes} B`;
}

const GIB = MIB * KIB;

/**
 * A file's size as a person reads it, the same everywhere: "4 B" below a
 * kilobyte, then KB, MB or GB to one decimal, a trailing `.0` left off.
 */
export function formatSize(bytes: number): string {
  if (bytes < KIB) return `${String(bytes)} B`;
  const [unit, size] =
    bytes >= GIB ? ['GB', GIB] : bytes >= MIB ? ['MB', MIB] : ['KB', KIB];
  return `${(bytes / size).toFixed(1).replace(/\.0$/, '')} ${unit}`;
}
