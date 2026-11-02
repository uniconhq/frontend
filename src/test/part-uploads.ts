import { http, HttpResponse } from 'msw';
import type { PartTransfer } from '@/api/upload/parts';

export function partTransfer(
  id: string,
  status: PartTransfer['status'] = 'open',
): PartTransfer {
  return {
    id,
    status,
    path: 'file',
    sha256: 'a'.repeat(64),
    size: 4,
    part_size: 16 * 1024 ** 2,
    reason: null,
    deadline_at: '2026-11-02T12:00:00Z',
    parts: [],
  };
}

/** Shared multipart protocol; each test supplies start and finish answers. */
export function partTransport(base: string) {
  return [
    http.get(`${base}/:id`, ({ params }) =>
      HttpResponse.json(partTransfer(String(params['id']))),
    ),
    http.post(`${base}/:id/sign`, async ({ request, params }) => {
      const body = (await request.json()) as { numbers: number[] };
      return HttpResponse.json(
        Object.fromEntries(
          body.numbers.map((number) => [
            number,
            `/unicon-uploads/${String(params['id'])}?partNumber=${String(number)}`,
          ]),
        ),
      );
    }),
    http.put(
      '/unicon-uploads/:id',
      () => new HttpResponse(null, { headers: { ETag: '"part"' } }),
    ),
    http.delete(`${base}/:id`, () => new HttpResponse(null, { status: 204 })),
  ];
}
