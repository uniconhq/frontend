import { describe, expect, it } from 'vitest';
import { makeZip } from '@/test/zip';
import { readZip, ZipError } from './zip';

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

  it('says a file is not a zip', async () => {
    await expect(
      readZip(new File(['not a zip at all'], 'x.zip')),
    ).rejects.toBeInstanceOf(ZipError);
  });
});
