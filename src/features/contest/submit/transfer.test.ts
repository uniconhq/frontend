import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { isApiError } from '@/api/problem';
import { server } from '@/test/server';
import { passTime, withFakeTimers } from '@/test/timers';
import { sendToStore } from './transfer';

const PARTS = '/unicon-uploads/uploads/abc';

/**
 * The size of each piece the file was cut into for sending. The request
 * stand-in the tests run on does not carry a Blob's bytes, so the length each
 * part goes with is read where it is cut; the end-to-end run sees the bytes
 * themselves.
 */
function piecesCut(): () => number[] {
  const cut = vi.spyOn(Blob.prototype, 'slice');
  return () => cut.mock.results.map((result) => (result.value as Blob).size);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sending a file in parts', () => {
  it('puts each part at exactly its length and answers with the ETags', async () => {
    const numbers: (string | null)[] = [];
    server.use(
      http.put(PARTS, ({ request }) => {
        const number = new URL(request.url).searchParams.get('partNumber');
        numbers.push(number);
        return new HttpResponse(null, { headers: { ETag: `"etag-${number ?? ''}"` } });
      }),
    );
    const lengths = piecesCut();
    const shares: number[] = [];

    const parts = await sendToStore(
      {
        id: 'abc',
        method: 'multipart',
        part_size: 4,
        parts: [
          {
            number: 1,
            url: `http://localhost:8080${PARTS}?partNumber=1&X-Amz-Signature=s`,
          },
          {
            number: 2,
            url: `http://localhost:8080${PARTS}?partNumber=2&X-Amz-Signature=s`,
          },
        ],
        expires_at: '2026-09-12T12:00:00Z',
      },
      new File(['123456'], 'model.bin'),
      (share) => shares.push(share),
    );

    expect(numbers).toEqual(['1', '2']);
    expect(lengths()).toEqual([4, 2]);
    expect(parts).toEqual([
      { number: 1, etag: '"etag-1"' },
      { number: 2, etag: '"etag-2"' },
    ]);
    expect(shares.at(-1)).toBe(1);
  });

  it('fails a part the store answers without an ETag', async () => {
    server.use(http.put(PARTS, () => new HttpResponse(null)));

    const sent = sendToStore(
      {
        id: 'abc',
        method: 'multipart',
        part_size: 4,
        parts: [{ number: 1, url: `${PARTS}?partNumber=1` }],
        expires_at: '2026-09-12T12:00:00Z',
      },
      new File(['12'], 'model.bin'),
      () => {},
    );

    await expect(sent).rejects.toSatisfy(
      (error) => isApiError(error) && error.code === 'upload_failed',
    );
  });
});

describe('a stalled upload', () => {
  withFakeTimers();

  it('is given up after half a minute of sending nothing', async () => {
    server.use(http.post('/unicon-uploads/', () => new Promise<never>(() => {})));

    const sent = sendToStore(
      {
        id: 'abc',
        method: 'post',
        url: '/unicon-uploads/',
        fields: { key: 'uploads/abc' },
        expires_at: '2026-09-12T12:00:00Z',
      },
      new File(['1'], 'main.py'),
      () => {},
    );
    const outcome = sent.catch((error: unknown) => error);
    await passTime(30_000);

    const error = await outcome;
    expect(isApiError(error) && error.code).toBe('upload_failed');
  });
});
