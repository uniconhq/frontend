import { ApiError, isApiError } from '@/api/problem';

/**
 * A door refusing early and a silently dead connection look alike, so a stall
 * counts as cut; the sender then asks where the upload stands.
 */
const STALL_MS = 30_000;

// The forge stores the file before answering, which can take minutes. The proxy waits as long.
const ANSWER_MS = 300_000;

function failed(cut = false): ApiError {
  return new ApiError({
    code: 'upload_failed',
    status: 0,
    title: 'The upload did not go through',
    extensions: cut ? { cut: true } : {},
  });
}

/** Broke or stalled, not refused: only then is sending again worth it. */
export function wasCut(error: unknown): boolean {
  return (
    isApiError(error) && error.code === 'upload_failed' && error.extensions.cut === true
  );
}

// Same origin, so the cookie goes along and dev uses the dev server's proxy.
function onThisOrigin(url: string): string {
  const target = new URL(url, window.location.href);
  return `${target.pathname}${target.search}`;
}

/**
 * `XMLHttpRequest`, not `fetch`, for upload progress. Every refusal fails the
 * same way; where the upload stands is read back afterwards.
 */
export async function sendToForge(
  url: string,
  file: File,
  onShare: (share: number) => void,
): Promise<void> {
  await sendBytes(url, file, onShare);
}

/** One multipart PUT, using the same stall rule as entrant uploads. */
export async function sendPartToStore(
  url: string,
  body: Blob,
  onShare: (share: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const etag = await sendBytes(url, body, onShare, signal, true);
  if (etag === null)
    throw new ApiError({
      code: 'upload_rejected',
      status: 422,
      title: 'The file store did not identify the uploaded part',
    });
  return etag;
}

function sendBytes(
  url: string,
  file: Blob,
  onShare: (share: number) => void,
  signal?: AbortSignal,
  wantEtag = false,
): Promise<string | null> {
  const share = (bytes: number) => onShare(file.size === 0 ? 1 : bytes / file.size);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled', 'AbortError'));
      return;
    }
    const request = new XMLHttpRequest();
    let stall: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(stall);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Upload cancelled', 'AbortError'));
      request.abort();
    };
    const cut = () => {
      cleanup();
      reject(Object.assign(failed(true), { source: { status: 0 } }));
    };
    const watch = (ms: number = STALL_MS) => {
      clearTimeout(stall);
      stall = setTimeout(() => {
        cut();
        request.abort();
      }, ms);
    };
    request.upload.onprogress = (event) => {
      watch();
      share(Math.min(event.loaded, file.size));
    };
    request.upload.onload = () => watch(wantEtag ? STALL_MS : ANSWER_MS);
    request.onload = () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) {
        onShare(1);
        resolve(wantEtag ? request.getResponseHeader('ETag') : null);
      } else reject(Object.assign(failed(), { source: { status: request.status } }));
    };
    request.onerror = cut;
    request.ontimeout = cut;
    request.open('PUT', onThisOrigin(url));
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    signal?.addEventListener('abort', abort, { once: true });
    watch();
    request.send(file);
  });
}
