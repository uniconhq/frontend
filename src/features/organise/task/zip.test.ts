import { describe, expect, it } from 'vitest';
import {
  BlobWriter,
  TextReader,
  ZipWriter,
  type ZipWriterAddDataOptions,
} from '@zip.js/zip.js/lib/zip-core-custom.js';
import { makeZip } from '@/test/zip';
import { MOST_ENTRIES, readZip, ZipError } from './zip';

/** A zip written by zip.js, for the archives a real tool writes that `makeZip` does not. */
async function written(
  files: { name: string; text: string; options?: ZipWriterAddDataOptions }[],
  zip64 = false,
): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter(), {
    useWebWorkers: false,
    zip64,
  });
  for (const { name, text, options } of files) {
    await writer.add(name, new TextReader(text), options);
  }
  return writer.close();
}

describe('reading a zip of tests in the browser', () => {
  it('lists its files, stored or deflated, and reads each one’s bytes', async () => {
    const zip = await makeZip([
      { name: 'small/', text: '' },
      { name: 'small/1/input', text: '1 2\n' },
      { name: 'small/1/answer', text: '3\n'.repeat(50), stored: true },
      { name: '__MACOSX/small/._1', text: 'x' },
    ]);

    const entries = await readZip(zip);

    expect(entries.map((entry) => [entry.path, entry.size, entry.problem])).toEqual([
      ['small/1/input', 4, null],
      ['small/1/answer', 100, null],
    ]);
    expect(await (await entries[0]!.read()).text()).toBe('1 2\n');
    expect(await (await entries[1]!.read()).text()).toBe('3\n'.repeat(50));
  });

  it('stops unpacking a file past the size the zip declares, and refuses one short of it', async () => {
    const zip = await makeZip([
      { name: 'big/1/input', text: '0'.repeat(1_000_000), declared: 4 },
      { name: 'small/1/input', text: '1 2\n', declared: 400 },
      { name: 'stored/1/input', text: '1 2\n', stored: true, declared: 40 },
    ]);

    const entries = await readZip(zip);

    expect(entries.map((entry) => entry.size)).toEqual([4, 400, 40]);
    for (const entry of entries) {
      await expect(entry.read()).rejects.toThrow(
        `${entry.path} is not the size the zip says it is, so the zip is damaged or made to mislead.`,
      );
    }
  });

  it('refuses a file that unpacks to more than 256 MB', async () => {
    const zip = await makeZip([
      { name: 'big/1/input', text: '0', declared: 256 * 2 ** 20 + 1 },
    ]);

    await expect(readZip(zip)).rejects.toThrow(
      'big/1/input unpacks to more than 256 MB, more than this page unpacks of one file.',
    );
  });

  it('refuses files that unpack to more than 1 GB together', async () => {
    const zip = await makeZip(
      [1, 2, 3, 4, 5].map((test) => ({
        name: `big/${String(test)}/input`,
        text: '0',
        declared: 250 * 2 ** 20,
      })),
    );

    await expect(readZip(zip)).rejects.toThrow(
      'The zip’s files unpack to more than 1 GB together, more than this page unpacks at once. Split it into smaller zips.',
    );
  });

  it('refuses a zip of more than 10,000 files', async () => {
    const zip = await makeZip([{ name: 'small/1/input', text: '1 2\n' }]);
    // The end of the archive says how many entries it lists; one that says
    // more than 10,000 is refused before any is read.
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const end = new DataView(bytes.buffer, bytes.length - 22);
    end.setUint16(8, MOST_ENTRIES + 1, true);
    end.setUint16(10, MOST_ENTRIES + 1, true);

    await expect(readZip(new File([bytes], 'tests.zip'))).rejects.toThrow(
      'The zip holds more than 10,000 files, more than this page unpacks at once. Split it into smaller zips.',
    );
  });

  it('reads a name written with backslashes, as some Windows tools write one, as a path', async () => {
    const zip = await makeZip([{ name: 'small\\1\\input', text: '1 2\n' }]);

    const entries = await readZip(zip);

    expect(entries.map((entry) => entry.path)).toEqual(['small/1/input']);
  });

  it('reads a Zip64 archive', async () => {
    const zip = await written([{ name: 'small/1/input', text: '1 2\n' }], true);

    const entries = await readZip(zip);

    expect(entries.map((entry) => [entry.path, entry.size])).toEqual([
      ['small/1/input', 4],
    ]);
    expect(await (await entries[0]!.read()).text()).toBe('1 2\n');
  });

  it('lists an encrypted file with why it cannot be read', async () => {
    const zip = await written([
      { name: 'small/1/input', text: '1 2\n', options: { password: 'secret' } },
      { name: 'small/1/answer', text: '3\n' },
    ]);

    const entries = await readZip(zip);

    expect(entries.map((entry) => [entry.path, entry.problem])).toEqual([
      ['small/1/input', 'It is encrypted.'],
      ['small/1/answer', null],
    ]);
  });

  it('refuses a zip with a path that leads out of its folders', async () => {
    const zip = await makeZip([{ name: '../1/input', text: '1 2\n' }]);

    await expect(readZip(zip)).rejects.toThrow(
      '../1/input points outside the zip’s own folders, so the zip is refused.',
    );
  });

  it('says a file is not a zip', async () => {
    await expect(
      readZip(new File(['not a zip at all'], 'x.zip')),
    ).rejects.toBeInstanceOf(ZipError);
  });
});
