import { ApiError } from '@/api/problem';
import type { FinishedPart, UploadSlot } from '@/api/types';

/**
 * How long a file may send nothing before it counts as stalled. The store
 * answers a request over its signed size by dropping it, often only after it
 * has stopped reading, so a stall is as much of an answer as it gives.
 */
const STALL_MS = 30_000;

function failed(): ApiError {
  return new ApiError({
    code: 'upload_failed',
    status: 0,
    title: 'The upload did not go through',
  });
}

/**
 * The slot's address on this origin. The store is served under the app's own
 * origin, `/unicon-uploads/`, and the slot is signed for that public URL; the
 * path alone keeps every file on this origin, and in development goes through
 * the dev server's proxy like `/api` does.
 */
function onThisOrigin(url: string): string {
  const target = new URL(url, window.location.href);
  return `${target.pathname}${target.search}`;
}

/**
 * One request to the store, with the bytes sent so far reported as they go.
 * Any answer but a 2xx, a dropped connection, and a stall all fail it the same
 * way, since the store's own error is nothing a contestant can use.
 */
function send(
  method: 'POST' | 'PUT',
  url: string,
  body: FormData | Blob,
  onSent: (bytes: number) => void,
): Promise<XMLHttpRequest> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let stall: ReturnType<typeof setTimeout> | undefined;
    const fail = () => {
      clearTimeout(stall);
      reject(failed());
    };
    const watch = () => {
      clearTimeout(stall);
      stall = setTimeout(() => {
        request.abort();
        fail();
      }, STALL_MS);
    };

    request.upload.onprogress = (event) => {
      watch();
      onSent(event.loaded);
    };
    request.onload = () => {
      clearTimeout(stall);
      if (request.status >= 200 && request.status < 300) resolve(request);
      else reject(failed());
    };
    request.onerror = fail;
    request.onabort = fail;
    request.ontimeout = fail;

    request.open(method, onThisOrigin(url));
    watch();
    request.send(body);
  });
}

/**
 * Sends `file` where its slot says, reporting the share of it sent, from 0 to
 * 1. A form slot is one POST of exactly the slot's `fields`, in their order,
 * and then the file last, as the signed policy requires: a field it did not
 * sign, such as a Content-Type, and the store refuses the form. A slot in
 * parts is one PUT per part, each exactly its share of the file, since each
 * URL is signed for that length; it answers the parts with the ETag the store
 * gave each one, which completing the upload names.
 */
export async function sendToStore(
  slot: UploadSlot,
  file: File,
  onShare: (share: number) => void,
): Promise<FinishedPart[]> {
  const share = (bytes: number) => onShare(file.size === 0 ? 1 : bytes / file.size);

  if (slot.method === 'post') {
    const form = new FormData();
    for (const [name, value] of Object.entries(slot.fields)) form.append(name, value);
    form.append('file', file);
    await send('POST', slot.url, form, (bytes) => share(Math.min(bytes, file.size)));
    onShare(1);
    return [];
  }

  const parts: FinishedPart[] = [];
  for (const part of slot.parts) {
    const start = (part.number - 1) * slot.part_size;
    const piece = file.slice(start, Math.min(start + slot.part_size, file.size));
    const answered = await send('PUT', part.url, piece, (bytes) =>
      share(start + bytes),
    );
    const etag = answered.getResponseHeader('ETag');
    if (etag === null) throw failed();
    parts.push({ number: part.number, etag });
  }
  onShare(1);
  return parts;
}
