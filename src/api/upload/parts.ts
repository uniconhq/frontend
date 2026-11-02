import Uppy from '@uppy/core';
import AwsS3, { type AwsS3UploadParameters } from '@uppy/aws-s3';
import { $api, widenQuery } from '@/api/query';
import { apiClient } from '@/api/client';
import { ApiError, isApiError } from '@/api/problem';
import type { components } from '@/api/schema';
import { sendPartToStore } from './transfer';

export type MultipartPlace =
  | { kind: 'task'; org: string; contest: string; task: string }
  | { kind: 'workflow'; owner: string; name: string };
export type PartTransfer = components['schemas']['Transfer'];

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/organise/part-uploads';
const WORKFLOW = '/api/v1/workflows/{owner}/{name}/part-uploads';

function client(place: MultipartPlace) {
  if (place.kind === 'workflow') {
    const path = { owner: place.owner, name: place.name };
    return {
      opened: async () =>
        required(
          (await apiClient.GET(WORKFLOW, { params: { path }, signal: deadline() }))
            .data,
        ),
      start: async (
        body: components['schemas']['PartUploadRequest'],
        signal?: AbortSignal,
      ) =>
        required(
          (
            await apiClient.POST(WORKFLOW, {
              params: { path },
              body,
              signal: deadline(signal),
            })
          ).data,
        ),
      read: async (upload: string, signal?: AbortSignal) =>
        required(
          (
            await apiClient.GET(`${WORKFLOW}/{upload}`, {
              params: { path: { ...path, upload } },
              signal: deadline(signal),
            })
          ).data,
        ),
      sign: async (upload: string, number: number, signal?: AbortSignal) =>
        required(
          (
            await apiClient.POST(`${WORKFLOW}/{upload}/sign`, {
              params: { path: { ...path, upload } },
              body: { numbers: [number] },
              signal: deadline(signal),
            })
          ).data,
        ),
      finish: async (
        upload: string,
        parts: components['schemas']['FinishedPart'][],
        signal?: AbortSignal,
      ) =>
        required(
          (
            await apiClient.POST(`${WORKFLOW}/{upload}/finish`, {
              params: { path: { ...path, upload } },
              body: { parts },
              signal: deadline(signal),
            })
          ).data,
        ),
      abort: async (upload: string, signal?: AbortSignal) => {
        await apiClient.DELETE(`${WORKFLOW}/{upload}`, {
          params: { path: { ...path, upload } },
          signal: deadline(signal),
        });
      },
    };
  }
  const path = { org: place.org, contest: place.contest, task: place.task };
  return {
    opened: async () =>
      required(
        (await apiClient.GET(TASK, { params: { path }, signal: deadline() })).data,
      ),
    start: async (
      body: components['schemas']['PartUploadRequest'],
      signal?: AbortSignal,
    ) =>
      required(
        (
          await apiClient.POST(TASK, {
            params: { path },
            body,
            signal: deadline(signal),
          })
        ).data,
      ),
    read: async (upload: string, signal?: AbortSignal) =>
      required(
        (
          await apiClient.GET(`${TASK}/{upload}`, {
            params: { path: { ...path, upload } },
            signal: deadline(signal),
          })
        ).data,
      ),
    sign: async (upload: string, number: number, signal?: AbortSignal) =>
      required(
        (
          await apiClient.POST(`${TASK}/{upload}/sign`, {
            params: { path: { ...path, upload } },
            body: { numbers: [number] },
            signal: deadline(signal),
          })
        ).data,
      ),
    finish: async (
      upload: string,
      parts: components['schemas']['FinishedPart'][],
      signal?: AbortSignal,
    ) =>
      required(
        (
          await apiClient.POST(`${TASK}/{upload}/finish`, {
            params: { path: { ...path, upload } },
            body: { parts },
            signal: deadline(signal),
          })
        ).data,
      ),
    abort: async (upload: string, signal?: AbortSignal) => {
      await apiClient.DELETE(`${TASK}/{upload}`, {
        params: { path: { ...path, upload } },
        signal: deadline(signal),
      });
    },
  };
}

function deadline(signal?: AbortSignal): AbortSignal {
  const limit = AbortSignal.timeout(30_000);
  return signal === undefined ? limit : AbortSignal.any([signal, limit]);
}

function required<T>(data: T | undefined): T {
  if (data === undefined) throw new Error('The upload got no answer. Try again.');
  return data;
}

export function partUploadsQuery(place: MultipartPlace) {
  return place.kind === 'task'
    ? widenQuery(
        $api.queryOptions('get', TASK, {
          params: {
            path: { org: place.org, contest: place.contest, task: place.task },
          },
        }),
      )
    : widenQuery(
        $api.queryOptions('get', WORKFLOW, {
          params: { path: { owner: place.owner, name: place.name } },
        }),
      );
}

export function readPartUpload(
  place: MultipartPlace,
  id: string,
  signal?: AbortSignal,
): Promise<PartTransfer> {
  return client(place).read(id, signal);
}

export function abortPartUpload(place: MultipartPlace, id: string): Promise<void> {
  return client(place).abort(id);
}

/**
 * The uploads this tab is sending now, each counted once per sender, so
 * Unfinished uploads leaves them to the page that sends them.
 */
const sendingHere = new Map<string, number>();
const watchers = new Set<() => void>();
let sendingNow: ReadonlySet<string> = new Set();

function markSending(id: string, by: 1 | -1) {
  const count = (sendingHere.get(id) ?? 0) + by;
  if (count > 0) sendingHere.set(id, count);
  else sendingHere.delete(id);
  sendingNow = new Set(sendingHere.keys());
  for (const watcher of watchers) watcher();
}

/** Calls `watcher` whenever the uploads this tab is sending change. */
export function watchSendingHere(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

/** The ids of the uploads this tab is sending now. */
export function sendingHereNow(): ReadonlySet<string> {
  return sendingNow;
}

/** What an upload stops with when the page that sends it is left. */
function left(): DOMException {
  return new DOMException('The upload was left before it finished.', 'AbortError');
}

/** Waits `ms`, or stops with `left()` once `signal` is aborted. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(left());
      return;
    }
    const stop = () => {
      clearTimeout(timer);
      reject(left());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve();
    }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
}

/** Whether a read failed in a way the next read may not: no answer, or a busy server. */
function transient(error: unknown): boolean {
  if (!isApiError(error)) return false;
  return error.status === 0 || error.status === 429 || error.status >= 500;
}

/**
 * Waits for the server to finish storing the upload, for up to an hour. A
 * read that gets no answer or a busy server is tried again, each wait longer
 * up to half a minute, so a moment's outage is not reported as a failure
 * while the server finishes.
 */
async function stored(
  place: MultipartPlace,
  transfer: PartTransfer,
  signal?: AbortSignal,
): Promise<string> {
  const until = performance.now() + 60 * 60 * 1000;
  let row = transfer;
  let wait = 1000;
  while (row.status === 'finishing' && performance.now() < until) {
    await pause(Math.min(wait, Math.max(0, until - performance.now())), signal);
    try {
      row = await readPartUpload(place, row.id, signal);
      wait = 1000;
    } catch (error) {
      if (signal?.aborted) throw left();
      if (!transient(error) || performance.now() >= until) throw error;
      wait = Math.min(wait * 2, 30_000);
    }
  }
  if (row.status !== 'stored')
    throw new ApiError({
      code: 'upload_rejected',
      status: 422,
      title: 'The upload was not stored',
      detail: row.reason ?? 'The upload was interrupted; send it again.',
    });
  return row.id;
}

/**
 * Only the failed part is retried; a server listing is the resume authority.
 * Aborting `signal`, as a page does when it is left, stops sending and
 * waiting with an `AbortError` and keeps the upload on the server to resume.
 */
export async function uploadInParts(
  place: MultipartPlace,
  file: File,
  path: string,
  sha256: string,
  onShare: (share: number) => void,
  onStoring: () => void,
  signal?: AbortSignal,
): Promise<string> {
  const api = client(place);
  const transfer = await api.start({ path, sha256, size: file.size }, signal);
  if (transfer.status === 'stored') return transfer.id;
  markSending(transfer.id, 1);
  try {
    return await sendParts(place, api, transfer, file, onShare, onStoring, signal);
  } finally {
    markSending(transfer.id, -1);
  }
}

async function sendParts(
  place: MultipartPlace,
  api: ReturnType<typeof client>,
  transfer: PartTransfer,
  file: File,
  onShare: (share: number) => void,
  onStoring: () => void,
  signal?: AbortSignal,
): Promise<string> {
  if (transfer.status === 'finishing') {
    onStoring();
    return stored(place, transfer, signal);
  }
  if (transfer.status !== 'open')
    throw new ApiError({
      code: 'upload_rejected',
      status: 422,
      title: 'The upload cannot continue',
      detail: transfer.reason ?? undefined,
    });
  const uppy = new Uppy({
    autoProceed: false,
    logger: { debug: () => undefined, warn: () => undefined, error: () => undefined },
  });
  let failure: Error | null = null;
  uppy.use(AwsS3, {
    shouldUseMultipart: true,
    limit: 4,
    retryDelays: [0, 1000, 3000, 5000],
    getChunkSize: () => transfer.part_size,
    createMultipartUpload: () => ({ key: transfer.id, uploadId: transfer.id }),
    listParts: async (_file, { signal }) =>
      (await readPartUpload(place, transfer.id, signal)).parts.map((part) => ({
        PartNumber: part.number,
        ETag: part.etag,
        Size: part.size,
      })),
    signPart: async (_file, { partNumber, signal }) => {
      const signed = await api.sign(transfer.id, partNumber, signal);
      const url = signed[String(partNumber)];
      if (url === undefined) throw new Error('The upload part was not signed.');
      return { url, method: 'PUT' as const };
    },
    uploadPartBytes: async ({
      signature,
      body,
      onProgress,
      onComplete,
      signal,
    }: {
      signature: AwsS3UploadParameters;
      body: FormData | Blob;
      onProgress: (event: ProgressEvent) => void;
      onComplete: (etag: string) => void;
      signal?: AbortSignal;
    }) => {
      if (!(body instanceof Blob))
        throw new Error('An upload part must be a file slice.');
      const etag = await sendPartToStore(
        signature.url,
        body,
        (share) =>
          onProgress(
            new ProgressEvent('progress', {
              loaded: share * body.size,
              total: body.size,
              lengthComputable: true,
            }),
          ),
        signal,
      );
      onComplete(etag);
      return { ETag: etag };
    },
    completeMultipartUpload: async (_file, { parts, signal: own }) => {
      const completed = await api.finish(
        transfer.id,
        parts.map((part) => {
          if (part.PartNumber === undefined || part.ETag === undefined)
            throw new Error('The file store did not confirm a part.');
          return { number: part.PartNumber, etag: part.ETag };
        }),
        own,
      );
      onStoring();
      await stored(place, completed, signal);
      return {};
    },
    // The uploader asks to abort after any failure; only the organiser's own
    // cancel (`abortPartUpload`) deletes an upload, so its parts stay to resume.
    abortMultipartUpload: () => Promise.resolve(),
  });
  uppy.on('upload-progress', (_file, progress) =>
    onShare(file.size === 0 ? 1 : (progress.bytesUploaded ?? 0) / file.size),
  );
  uppy.on('upload-error', (_file, error) => {
    failure = error;
  });
  // Leaving the page settles the upload at once; destroying the uploader
  // below then stops its requests and retries.
  let leave: () => void = () => undefined;
  const leaving = new Promise<never>((_resolve, reject) => {
    leave = () => reject(left());
  });
  leaving.catch(() => undefined);
  signal?.addEventListener('abort', leave, { once: true });
  if (signal?.aborted) leave();
  try {
    const id = uppy.addFile({ name: file.name, type: file.type, data: file });
    // The uploader keeps its public resume state beside the core file fields.
    const resume = { s3Multipart: { key: transfer.id, uploadId: transfer.id } };
    uppy.setFileState(id, { ...uppy.getFile(id), ...resume });
    const result = await Promise.race([uppy.upload(), leaving]);
    if (!result || result.failed?.length)
      throw (
        failure ??
        new Error('The upload did not finish. Choose the file again to resume.')
      );
    return transfer.id;
  } finally {
    signal?.removeEventListener('abort', leave);
    uppy.destroy();
  }
}
