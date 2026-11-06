const KIB = 1024;
const MIB = KIB * KIB;

export function formatLimit(bytes: number): string {
  if (bytes >= MIB && bytes % MIB === 0) return `${bytes / MIB} MB`;
  if (bytes >= KIB && bytes % KIB === 0) return `${bytes / KIB} KB`;
  return `${bytes} B`;
}

const GIB = MIB * KIB;

export function formatSize(bytes: number): string {
  if (bytes < KIB) return `${String(bytes)} B`;
  const [unit, size] =
    bytes >= GIB ? ['GB', GIB] : bytes >= MIB ? ['MB', MIB] : ['KB', KIB];
  return `${(bytes / size).toFixed(1).replace(/\.0$/, '')} ${unit}`;
}
