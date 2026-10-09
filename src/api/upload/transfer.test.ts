import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { isApiError } from '@/api/problem';
import { server } from '@/test/server';
import { passTime, withFakeTimers } from '@/test/timers';
import { digestOf } from './digest';
import { sendToForge, wasCut } from './transfer';

const DOOR = '/-/uploads/abc';

describe('sending a file through the door', () => {
  it('puts the file itself, once, and reports it as sent', async () => {
    // The request stand-in these tests run on does not carry a Blob's bytes,
    // so what is checked here is that one PUT went to the slot's address and
    // that progress reached the end; the end-to-end run sees the bytes.
    const methods: string[] = [];
    server.use(
      http.put(DOOR, ({ request }) => {
        methods.push(request.method);
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const shares: number[] = [];

    await sendToForge(DOOR, new File(['123456'], 'model.bin'), (share) =>
      shares.push(share),
    );

    expect(methods).toEqual(['PUT']);
    expect(shares.at(-1)).toBe(1);
  });

  it('fails whatever the forge says, since none of it is the sender’s to act on', async () => {
    // The door refuses before it reads the body, and the forge refuses a body
    // that is not what the address named. Either way the panel reads the
    // upload back rather than showing what came out of the forge.
    for (const status of [403, 422, 500]) {
      server.use(http.put(DOOR, () => new HttpResponse('<Error/>', { status })));

      const sent = sendToForge(DOOR, new File(['12'], 'model.bin'), () => {});

      await expect(sent).rejects.toSatisfy(
        (error) =>
          isApiError(error) && error.code === 'upload_failed' && !wasCut(error),
      );
    }
  });

  it('fails as cut when the connection breaks, so it can be sent again', async () => {
    server.use(http.put(DOOR, () => HttpResponse.error()));

    const sent = sendToForge(DOOR, new File(['12'], 'model.bin'), () => {});

    await expect(sent).rejects.toSatisfy(wasCut);
  });
});

describe('a stalled upload', () => {
  withFakeTimers();

  it('is given up as cut after half a minute of sending nothing', async () => {
    server.use(http.put(DOOR, () => new Promise<never>(() => {})));

    const sent = sendToForge(DOOR, new File(['1'], 'main.py'), () => {});
    const outcome = sent.catch((error: unknown) => error);
    await passTime(30_000);

    const error = await outcome;
    expect(isApiError(error) && error.code).toBe('upload_failed');
    expect(wasCut(error)).toBe(true);
  });
});

describe('working out what a file hashes to', () => {
  it('reads it in slices and never holds it whole', async () => {
    // Four slices of eight megabytes would be read for a file this size were
    // it larger; what matters here is that the answer is the file's SHA-256
    // and that progress reaches the end.
    const content = 'print(1)\n';
    const shares: number[] = [];

    const digest = await digestOf(new File([content], 'main.py'), (share) =>
      shares.push(share),
    );

    expect(digest).toBe(
      'cc42155088fca5730758db72b2a5bca33112a941dfaa2d43098ec422ce4ea213',
    );
    expect(shares.at(-1)).toBe(1);
  });

  it('gives an empty file its own digest rather than nothing', async () => {
    const digest = await digestOf(new File([], 'empty.bin'), () => {});

    expect(digest).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});
