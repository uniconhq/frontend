import { ApiError } from '@/api/problem';

/**
 * How long a file may send nothing before it counts as stalled. The door
 * refuses an upload before it reads the body, often only after it has stopped
 * reading, so a stall is as much of an answer as it gives.
 */
const STALL_MS = 30_000;

/**
 * How long the answer may take once the last byte has gone: the forge
 * finishes writing the file to its store before it answers, which for a
 * large file under load can take minutes. The proxy waits as long.
 */
const ANSWER_MS = 300_000;

function failed(): ApiError {
  return new ApiError({
    code: 'upload_failed',
    status: 0,
    title: 'The upload did not go through',
  });
}

/**
 * The slot's address on this origin. The door is a path on the app's own
 * host, so the session cookie goes with the request and there is no CORS; in
 * development it goes through the dev server's proxy like `/api` does.
 */
function onThisOrigin(url: string): string {
  const target = new URL(url, window.location.href);
  return `${target.pathname}${target.search}`;
}

/**
 * Sends `file` to the address its slot names, reporting the share of it sent,
 * from 0 to 1.
 *
 * One PUT of the file itself. `XMLHttpRequest` rather than `fetch` because it
 * streams the file from disk and reports how much has gone, which `fetch`
 * does not; the browser never holds the file in memory either way.
 *
 * The forge hashes the body as it stores it and keeps nothing that is not the
 * digest and length the address names, so a file that changed since it was
 * read is refused there. Every refusal fails this the same way: what the
 * forge says about it is not something a contestant can use, and where the
 * upload stands is read back from the platform afterwards.
 */
export function sendToForge(
  url: string,
  file: File,
  onShare: (share: number) => void,
): Promise<void> {
  const share = (bytes: number) => onShare(file.size === 0 ? 1 : bytes / file.size);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let stall: ReturnType<typeof setTimeout> | undefined;
    const fail = () => {
      clearTimeout(stall);
      reject(failed());
    };
    const watch = (ms: number = STALL_MS) => {
      clearTimeout(stall);
      stall = setTimeout(() => {
        request.abort();
        fail();
      }, ms);
    };

    request.upload.onprogress = (event) => {
      watch();
      share(Math.min(event.loaded, file.size));
    };
    request.upload.onload = () => watch(ANSWER_MS);
    request.onload = () => {
      clearTimeout(stall);
      if (request.status >= 200 && request.status < 300) {
        onShare(1);
        resolve();
      } else reject(failed());
    };
    request.onerror = fail;
    request.onabort = fail;
    request.ontimeout = fail;

    request.open('PUT', onThisOrigin(url));
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    watch();
    request.send(file);
  });
}
