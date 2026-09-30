import { t } from './t';

const KIB = 1024;
const MIB = KIB * KIB;

/** A size as a limit is written: whole MiB or KiB when it is one, else bytes. */
export function formatLimit(bytes: number): string {
  if (bytes >= MIB && bytes % MIB === 0) return `${bytes / MIB} ${t('MB')}`;
  if (bytes >= KIB && bytes % KIB === 0) return `${bytes / KIB} ${t('KB')}`;
  return `${bytes} ${t('bytes')}`;
}

/** A measured size, such as a file's: bytes, or KB and MB to one decimal. */
export function formatSize(bytes: number): string {
  if (bytes >= MIB) return `${(bytes / MIB).toFixed(1)} ${t('MB')}`;
  if (bytes >= KIB) return `${(bytes / KIB).toFixed(1)} ${t('KB')}`;
  return `${bytes} ${t('bytes')}`;
}
