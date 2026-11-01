import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { ApiError } from '@/api/problem';
import { uploadInParts, type PartTransfer } from './parts';

const BASE = '/api/v1/orgs/acme/contests/spring/tasks/sum/organise/part-uploads';
const place = { kind: 'task' as const, org: 'acme', contest: 'spring', task: 'sum' };
const chunk = 5 * 1024 * 1024;
const row: PartTransfer = {
  id: 'resume',
  path: 'data.bin',
  sha256: 'a'.repeat(64),
  size: 2 * chunk + 1,
  part_size: chunk,
  status: 'open',
  reason: null,
  deadline_at: '2026-11-01T12:00:00Z',
  parts: [],
};

function mockParts({ resume = false, cut = false, refuse = false } = {}) {
  const sent: number[] = [];
  let completed: unknown;
  let state: PartTransfer = {
    ...row,
    parts: resume ? [{ number: 1, etag: '"part-1"', size: chunk }] : [],
  };
  server.use(
    http.post(BASE, () => HttpResponse.json(state)),
    http.get(`${BASE}/resume`, () => HttpResponse.json(state)),
    http.post(`${BASE}/resume/sign`, async ({ request }) => {
      const body = (await request.json()) as { numbers: number[] };
      const number = body.numbers[0]!;
      return HttpResponse.json({
        [number]: `/unicon-uploads/resume?partNumber=${String(number)}`,
      });
    }),
    http.put('/unicon-uploads/resume', ({ request }) => {
      const number = Number(new URL(request.url).searchParams.get('partNumber'));
      sent.push(number);
      if (cut && number === 2 && sent.filter((each) => each === 2).length === 1)
        return HttpResponse.error();
      return new HttpResponse(null, { headers: { ETag: `"part-${String(number)}"` } });
    }),
    http.post(`${BASE}/resume/finish`, async ({ request }) => {
      completed = await request.json();
      state = {
        ...state,
        status: refuse ? 'refused' : 'stored',
        reason: refuse ? 'content hash does not match OID' : null,
        parts: [],
      };
      return HttpResponse.json(state);
    }),
  );
  return { sent, completed: () => completed };
}

function file() {
  return new File([new Uint8Array(row.size)], 'data.bin');
}

describe('resumable organiser multipart uploads', () => {
  it('retries a failed part alone and waits for verified storage', async () => {
    const mock = mockParts({ cut: true });
    const states: string[] = [];
    expect(
      await uploadInParts(
        place,
        file(),
        'data.bin',
        row.sha256,
        () => {},
        () => states.push('storing'),
      ),
    ).toBe('resume');
    expect(mock.sent.filter((n) => n === 1)).toHaveLength(1);
    expect(mock.sent.filter((n) => n === 2)).toHaveLength(2);
    expect(mock.sent.filter((n) => n === 3)).toHaveLength(1);
    expect(states).toEqual(['storing']);
    expect(mock.completed()).toEqual({
      parts: [
        { number: 1, etag: '"part-1"' },
        { number: 2, etag: '"part-2"' },
        { number: 3, etag: '"part-3"' },
      ],
    });
  });
  it('uses the server list after a reload and sends only missing parts', async () => {
    const mock = mockParts({ resume: true });
    await uploadInParts(
      place,
      file(),
      'data.bin',
      row.sha256,
      () => {},
      () => {},
    );
    expect(mock.sent.sort()).toEqual([2, 3]);
  });
  it('shows the verified-storage refusal instead of calling the file uploaded', async () => {
    mockParts({ refuse: true });
    await expect(
      uploadInParts(
        place,
        file(),
        'data.bin',
        row.sha256,
        () => {},
        () => {},
      ),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof ApiError && error.detail === 'content hash does not match OID',
    );
  });
});

describe('waiting for a finishing upload', () => {
  function finishing(reads: (count: number) => Response | Promise<Response>) {
    let count = 0;
    let aborted = false;
    server.use(
      http.post(BASE, () => HttpResponse.json({ ...row, status: 'finishing' })),
      http.get(`${BASE}/resume`, () => {
        count += 1;
        return reads(count);
      }),
      http.delete(`${BASE}/resume`, () => {
        aborted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    return { reads: () => count, aborted: () => aborted };
  }
  const send = (signal?: AbortSignal) =>
    uploadInParts(
      place,
      file(),
      'data.bin',
      row.sha256,
      () => {},
      () => {},
      signal,
    );

  it('reads again after a read that got no answer or a busy server', async () => {
    const mock = finishing((count) =>
      count === 1
        ? HttpResponse.json({ code: 'unavailable' }, { status: 503 })
        : count === 2
          ? HttpResponse.error()
          : HttpResponse.json({ ...row, status: 'stored' }),
    );
    expect(await send()).toBe('resume');
    expect(mock.reads()).toBe(3);
  }, 15_000);
  it('stops at a refusal that reading again would not change', async () => {
    finishing(() => HttpResponse.json({ code: 'not_found' }, { status: 404 }));
    await expect(send()).rejects.toSatisfy(
      (error) => error instanceof ApiError && error.status === 404,
    );
  });
  it('stops reading once the page is left and keeps the upload', async () => {
    const mock = finishing(() => HttpResponse.json({ ...row, status: 'finishing' }));
    const leaving = new AbortController();
    const waiting = send(leaving.signal);
    await vi.waitFor(() => expect(mock.reads()).toBe(1), { timeout: 3000 });
    leaving.abort();
    await expect(waiting).rejects.toSatisfy(
      (error) => error instanceof DOMException && error.name === 'AbortError',
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(mock.reads()).toBe(1);
    expect(mock.aborted()).toBe(false);
  });
  it('keeps the parts sent when the page is left mid-upload', async () => {
    let aborted = false;
    let signing = false;
    server.use(
      http.post(BASE, () => HttpResponse.json(row)),
      http.get(`${BASE}/resume`, () => HttpResponse.json(row)),
      http.post(`${BASE}/resume/sign`, async () => {
        signing = true;
        await new Promise(() => undefined);
        return HttpResponse.json({});
      }),
      http.delete(`${BASE}/resume`, () => {
        aborted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const leaving = new AbortController();
    const sending = send(leaving.signal);
    await vi.waitFor(() => expect(signing).toBe(true));
    leaving.abort();
    await expect(sending).rejects.toSatisfy(
      (error) => error instanceof DOMException && error.name === 'AbortError',
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(aborted).toBe(false);
  });
});
