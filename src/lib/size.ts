const KIB = 1024;
const MIB = KIB * KIB;

/** A size as a limit is written: whole MiB or KiB when it is one, else bytes. */
export function formatLimit(bytes: number): string {
  if (bytes >= MIB && bytes % MIB === 0) return `${bytes / MIB} MB`;
  if (bytes >= KIB && bytes % KIB === 0) return `${bytes / KIB} KB`;
  return `${bytes} bytes`;
}

const GIB = MIB * KIB;

/**
 * A file's size as a person reads it: bytes below a kilobyte, then KB, MB or
 * GB to one decimal, a trailing `.0` left off.
 */
export function formatSize(bytes: number): string {
  if (bytes < KIB) return `${String(bytes)} ${bytes === 1 ? 'byte' : 'bytes'}`;
  const [unit, size] =
    bytes >= GIB ? ['GB', GIB] : bytes >= MIB ? ['MB', MIB] : ['KB', KIB];
  return `${(bytes / size).toFixed(1).replace(/\.0$/, '')} ${unit}`;
}
