/**
 * A small reader of zip archives, enough to take tests out of one in the
 * browser: the central directory is read from the end of the file, each
 * entry's bytes are sliced out only when asked for, and a compressed entry is
 * inflated by the browser's own `DecompressionStream`, so no library is
 * needed and the archive is never held in memory whole. Entries stored as
 * they are and deflated ones are read, Zip64 archives included; an encrypted
 * entry, or one packed another way, is listed with the reason it cannot be
 * read.
 */

/** One file of an archive: its path in it, its size once unpacked, and its bytes on request. */
export type ZipEntry = {
  path: string;
  size: number;
  /** Why its bytes cannot be read here, or null when they can. */
  problem: string | null;
  read: () => Promise<Blob>;
};

const END = 0x06054b50;
const END64 = 0x06064b50;
const END64_LOCATOR = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX16 = 0xffff;
const MAX32 = 0xffffffff;

/** Why an archive could not be read at all. */
export class ZipError extends Error {}

async function bytesOf(file: Blob, start: number, end: number): Promise<DataView> {
  const buffer = await file.slice(start, end).arrayBuffer();
  return new DataView(buffer);
}

/** A 64-bit little-endian number, which no archive here needs beyond 2^53. */
function uint64(view: DataView, at: number): number {
  return view.getUint32(at, true) + view.getUint32(at + 4, true) * 2 ** 32;
}

const UTF8 = new TextDecoder('utf-8');

/** Where the central directory starts, how long it is and how many entries it has. */
async function directoryOf(
  file: Blob,
): Promise<{ offset: number; size: number; count: number }> {
  const tail = Math.min(file.size, 22 + MAX16 + 20);
  const view = await bytesOf(file, file.size - tail, file.size);
  for (let at = view.byteLength - 22; at >= 0; at -= 1) {
    if (view.getUint32(at, true) !== END) continue;
    let count = view.getUint16(at + 10, true);
    let size = view.getUint32(at + 12, true);
    let offset = view.getUint32(at + 16, true);
    const locator = at - 20;
    if (
      (count === MAX16 || size === MAX32 || offset === MAX32) &&
      locator >= 0 &&
      view.getUint32(locator, true) === END64_LOCATOR
    ) {
      const where = uint64(view, locator + 8);
      const end64 = await bytesOf(file, where, where + 56);
      if (end64.getUint32(0, true) !== END64)
        throw new ZipError('The zip file is damaged.');
      count = uint64(end64, 32);
      size = uint64(end64, 40);
      offset = uint64(end64, 48);
    }
    return { offset, size, count };
  }
  throw new ZipError('It is not a zip archive.');
}

/** The sizes and offset the Zip64 extra field gives in place of the ones set to the most. */
function zip64Of(
  view: DataView,
  at: number,
  length: number,
  wanted: { size: boolean; compressed: boolean; offset: boolean },
): { size?: number; compressed?: number; offset?: number } {
  const found: { size?: number; compressed?: number; offset?: number } = {};
  let place = at;
  while (place + 4 <= at + length) {
    const id = view.getUint16(place, true);
    const size = view.getUint16(place + 2, true);
    if (id === 0x0001) {
      let field = place + 4;
      if (wanted.size) {
        found.size = uint64(view, field);
        field += 8;
      }
      if (wanted.compressed) {
        found.compressed = uint64(view, field);
        field += 8;
      }
      if (wanted.offset) found.offset = uint64(view, field);
      return found;
    }
    place += 4 + size;
  }
  return found;
}

/** The most files an archive may hold, its folders counted. */
export const MOST_ENTRIES = 10_000;
/** The most bytes one file may unpack to. */
const MOST_FILE = 256 * 2 ** 20;
/** The most bytes an archive's files may unpack to together. */
const MOST_TOTAL = 2 ** 30;

/** That the archive is not what it says of `name`'s size. */
function wrongSize(name: string): ZipError {
  return new ZipError(
    `${name} is not the size the zip says it is, so the zip is damaged or made to mislead.`,
  );
}

/**
 * The bytes of a deflated entry, inflated as the browser does a chunk at a
 * time, stopped as soon as they pass the size the archive declares, and
 * refused when they end short of it, so a small archive cannot unpack to
 * far more than it says.
 */
async function inflate(compressed: Blob, name: string, size: number): Promise<Blob> {
  const body = new Response(await compressed.arrayBuffer()).body;
  if (body === null) return new Blob([]);
  const reader = body.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > size) {
      await reader.cancel();
      throw wrongSize(name);
    }
    chunks.push(value);
  }
  if (length !== size) throw wrongSize(name);
  return new Blob(chunks);
}

/**
 * Every file of a zip archive, in the order its directory lists them, its
 * folders and the folders a Mac adds (`__MACOSX/`) left out. An archive of
 * more than 10,000 entries, with a file over 256 MB unpacked, or with files
 * over 1 GB unpacked together, is refused, and so is a file whose bytes
 * are not the size the archive declares when they are read.
 */
export async function readZip(file: Blob): Promise<ZipEntry[]> {
  const { offset, size, count } = await directoryOf(file);
  if (count > MOST_ENTRIES) {
    throw new ZipError(
      `The zip holds more than ${MOST_ENTRIES.toLocaleString('en')} files, more than this page unpacks at once. Split it into smaller zips.`,
    );
  }
  let total = 0;
  const view = await bytesOf(file, offset, offset + size);
  const entries: ZipEntry[] = [];
  let at = 0;
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > view.byteLength || view.getUint32(at, true) !== CENTRAL) {
      throw new ZipError('The zip file’s list of contents is damaged.');
    }
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    let compressed = view.getUint32(at + 20, true);
    let unpacked = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    let local = view.getUint32(at + 42, true);
    // Some Windows tools write a path's folders with backslashes.
    const name = UTF8.decode(
      new Uint8Array(view.buffer, view.byteOffset + at + 46, nameLength),
    ).replaceAll('\\', '/');
    const big = zip64Of(view, at + 46 + nameLength, extraLength, {
      size: unpacked === MAX32,
      compressed: compressed === MAX32,
      offset: local === MAX32,
    });
    unpacked = big.size ?? unpacked;
    compressed = big.compressed ?? compressed;
    local = big.offset ?? local;
    at += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/') || name.startsWith('__MACOSX/')) continue;
    if (unpacked > MOST_FILE) {
      throw new ZipError(
        `${name} unpacks to more than 256 MB, more than this page unpacks of one file.`,
      );
    }
    total += unpacked;
    if (total > MOST_TOTAL) {
      throw new ZipError(
        'The zip’s files unpack to more than 1 GB together, more than this page unpacks at once. Split it into smaller zips.',
      );
    }
    const problem =
      (flags & 1) !== 0
        ? 'It is encrypted.'
        : method !== 0 && method !== 8
          ? 'It is compressed in a way this page cannot unpack.'
          : null;
    const start = local;
    const length = compressed;
    entries.push({
      path: name,
      size: unpacked,
      problem,
      read: async () => {
        const header = await bytesOf(file, start, start + 30);
        if (header.getUint32(0, true) !== LOCAL) {
          throw new ZipError(`${name} is damaged in the archive.`);
        }
        const data =
          start + 30 + header.getUint16(26, true) + header.getUint16(28, true);
        const raw = file.slice(data, data + length);
        if (method !== 0) return inflate(raw, name, unpacked);
        if (raw.size !== unpacked) throw wrongSize(name);
        return raw;
      },
    });
  }
  return entries;
}
