/**
 * Tests taken out of a zip archive in the browser, read with zip.js: the
 * central directory is read from the end of the file, each entry's bytes are
 * sliced out only when asked for and inflated by the browser's own
 * `DecompressionStream`, so the archive is never held in memory whole. Entries
 * stored as they are and deflated ones are read, Zip64 archives included; an
 * encrypted entry, or one packed another way, is listed with the reason it
 * cannot be read. On top of what zip.js checks, an archive is refused past
 * the limits below.
 */
import {
  BlobReader,
  BlobWriter,
  ERR_EOCDR_NOT_FOUND,
  ERR_INVALID_UNCOMPRESSED_SIZE,
  ERR_UNSAFE_FILENAME,
  ZipReader,
  type FileEntry,
} from '@zip.js/zip.js/lib/zip-core-custom.js';

/** One file of an archive: its path in it, its size once unpacked, and its bytes on request. */
export type ZipEntry = {
  path: string;
  size: number;
  /** Why its bytes cannot be read here, or null when they can. */
  problem: string | null;
  read: () => Promise<Blob>;
};

/** Why an archive could not be read at all. */
export class ZipError extends Error {}

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

/** What zip.js threw while listing the archive, said as this page says it. */
function listingError(error: unknown): ZipError {
  if (error instanceof ZipError) return error;
  if (!(error instanceof Error)) {
    return new ZipError('The zip file’s list of contents is damaged.');
  }
  if (error.message === ERR_EOCDR_NOT_FOUND) {
    return new ZipError('It is not a zip archive.');
  }
  if (error.message === ERR_UNSAFE_FILENAME) {
    const name = (error as Error & { filename?: string }).filename ?? '';
    return new ZipError(
      `${name} points outside the zip’s own folders, so the zip is refused.`,
    );
  }
  return new ZipError('The zip file’s list of contents is damaged.');
}

/**
 * The bytes of one file, which zip.js inflates a chunk at a time, stops as
 * soon as they pass the size the archive declares, and refuses when they end
 * short of it, so a small archive cannot unpack to far more than it says.
 */
async function bytesOf(entry: FileEntry, name: string): Promise<Blob> {
  try {
    return await entry.getData(new BlobWriter());
  } catch (error) {
    if (error instanceof Error && error.message === ERR_INVALID_UNCOMPRESSED_SIZE) {
      throw wrongSize(name);
    }
    throw new ZipError(`${name} is damaged in the archive.`);
  }
}

/**
 * Every file of a zip archive, in the order its directory lists them, its
 * folders and the folders a Mac adds (`__MACOSX/`) left out. An archive of
 * more than 10,000 entries, with a file over 256 MB unpacked, or with files
 * over 1 GB unpacked together, is refused, and so is a file whose bytes
 * are not the size the archive declares when they are read.
 */
export async function readZip(file: Blob): Promise<ZipEntry[]> {
  const reader = new ZipReader(new BlobReader(file), {
    useWebWorkers: false,
    // Some Windows tools write a path's folders with backslashes.
    normalizeFilename: (name) => name.replaceAll('\\', '/'),
  });
  // How many entries the archive says it lists, known with its first one.
  let listed = 0;
  let total = 0;
  const entries: ZipEntry[] = [];
  try {
    for await (const entry of reader.getEntriesGenerator({
      onprogress: (_index, count) => {
        listed = count;
      },
    })) {
      if (listed > MOST_ENTRIES) {
        throw new ZipError(
          `The zip holds more than ${MOST_ENTRIES.toLocaleString('en')} files, more than this page unpacks at once. Split it into smaller zips.`,
        );
      }
      const name = entry.filename;
      if (entry.directory || name.startsWith('__MACOSX/')) continue;
      if (entry.uncompressedSize > MOST_FILE) {
        throw new ZipError(
          `${name} unpacks to more than 256 MB, more than this page unpacks of one file.`,
        );
      }
      total += entry.uncompressedSize;
      if (total > MOST_TOTAL) {
        throw new ZipError(
          'The zip’s files unpack to more than 1 GB together, more than this page unpacks at once. Split it into smaller zips.',
        );
      }
      const problem = entry.encrypted
        ? 'It is encrypted.'
        : entry.compressionMethod !== 0 && entry.compressionMethod !== 8
          ? 'It is compressed in a way this page cannot unpack.'
          : null;
      entries.push({
        path: name,
        size: entry.uncompressedSize,
        problem,
        read: () => bytesOf(entry, name),
      });
    }
  } catch (error) {
    throw listingError(error);
  }
  return entries;
}
