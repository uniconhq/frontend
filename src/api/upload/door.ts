import { ApiError, toApiError } from '@/api/problem';
import type { Upload } from '@/api/types';
import { digestOf } from './digest';
import { sendToForge } from './transfer';

// Shared by contestant and organiser uploads; each brings its own slot and complete routes.

type Status = Upload['status'];

/** A file moved or deleted since it was chosen fails as `upload_failed`. */
export async function hashOf(
  file: File,
  onShare: (share: number) => void,
): Promise<string> {
  try {
    return await digestOf(file, onShare);
  } catch {
    throw new ApiError({
      code: 'upload_failed',
      status: 0,
      title: 'The file could not be read',
    });
  }
}

/** A slot with no URL is a file the forge already holds; nothing is sent. */
export async function sendAndComplete(
  slot: { url: string | null },
  file: File,
  onShare: (share: number) => void,
  complete: () => Promise<Upload>,
): Promise<Status> {
  if (slot.url !== null) await sendToForge(slot.url, file, onShare);
  onShare(1);
  return (await complete()).status;
}

/** Null while the bytes are not there; a failed send may still have arrived. */
export async function arrival(complete: () => Promise<Upload>): Promise<Status | null> {
  try {
    return (await complete()).status;
  } catch (error) {
    if (toApiError(error).code === 'upload_not_ready') return null;
    throw error;
  }
}

export function mustBeVerified(status: Status): void {
  if (status !== 'verified') {
    throw new ApiError({
      code: 'upload_rejected',
      status: 0,
      title: 'A file did not arrive as it was sent',
    });
  }
}
