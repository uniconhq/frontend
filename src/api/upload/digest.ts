import { createSHA256 } from 'hash-wasm';

const SLICE_BYTES = 8 * 1024 * 1024;

/** Hashed in slices: `crypto.subtle.digest` would need the whole file in memory. */
export async function digestOf(
  file: File,
  onShare: (share: number) => void,
): Promise<string> {
  const hash = await createSHA256();
  hash.init();
  let read = 0;
  while (read < file.size) {
    const slice = file.slice(read, Math.min(read + SLICE_BYTES, file.size));
    hash.update(new Uint8Array(await slice.arrayBuffer()));
    read += slice.size;
    onShare(file.size === 0 ? 1 : read / file.size);
  }
  onShare(1);
  return hash.digest('hex');
}
