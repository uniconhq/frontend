import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { partTransfer } from '@/test/part-uploads';
import { useTaskUpload } from './use-task-upload';

const place = { kind: 'task' as const, org: 'acme', contest: 'spring', task: 'sum' };
const BASE = '/api/v1/orgs/acme/contests/spring/tasks/sum/organise/part-uploads';
const UPLOAD = '0199a2c1-6b7e-7c3a-9f10-5d2e4b8a6c99';

describe('an upload whose page is left', () => {
  it('stops waiting for the server once the page is left', async () => {
    let reads = 0;
    server.use(
      http.post(BASE, () => HttpResponse.json(partTransfer(UPLOAD, 'finishing'))),
      http.get(`${BASE}/${UPLOAD}`, () => {
        reads += 1;
        return HttpResponse.json(partTransfer(UPLOAD, 'finishing'));
      }),
    );
    const { result, unmount } = renderHook(() => useTaskUpload(place));
    void act(() => result.current.start(new File(['1 2\n'], 'in.txt'), 'in.txt', null));
    await waitFor(() => expect(reads).toBe(1), { timeout: 3000 });
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(reads).toBe(1);
  });
});
