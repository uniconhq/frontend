import { createSHA256 } from 'hash-wasm';

/**
 * How much of a file is read at a time. The whole point is never to hold the
 * file in memory, so this is what a hash of a two-gigabyte model costs.
 */
const SLICE_BYTES = 8 * 1024 * 1024;

/**
 * The SHA-256 of a file, in lowercase hex, reporting the share read as it
 * goes, from 0 to 1.
 *
 * This is what the forge checks the bytes against as they arrive, so it has
 * to be the hash of what is actually sent: the file is read in slices and fed
 * to the hash one at a time, never gathered. `crypto.subtle.digest` cannot do
 * this, because it takes one buffer and would need the whole file in memory.
 *
 * An empty file hashes to the empty digest, which is a real answer, not a
 * missing one.
 */
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
