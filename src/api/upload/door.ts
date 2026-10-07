import { ApiError, toApiError } from '@/api/problem';
import type { Upload } from '@/api/types';
import { digestOf } from './digest';
import { sendToForge } from './transfer';

/**
 * The steps every file takes through the upload door, whoever sends it: a
 * contestant's file for a submission, or an organiser's for a task. The
 * caller asks for the slot and completes the upload with its own route; what
 * happens between, and what the answers mean, is the same for both.
 */

/** Where an upload stands once completed. */
type Status = Upload['status'];

/**
 * The SHA-256 of a file, reporting the share read, from 0 to 1. A file the
 * browser can no longer read, moved or deleted since it was chosen, fails
 * as an upload that did not go through.
 */
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

/**
 * Sends the file to its slot and completes it, answering where the upload
 * stands. A slot with no address is for a file the forge holds already, and
 * nothing is sent to it.
 */
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

/**
 * Where an upload stands, or null while its bytes are not there: a send that
 * failed may still have arrived, and this asks before sending again.
 */
export async function arrival(complete: () => Promise<Upload>): Promise<Status | null> {
  try {
    return (await complete()).status;
  } catch (error) {
    if (toApiError(error).code === 'upload_not_ready') return null;
    throw error;
  }
}

/** Fails unless the forge holds the file as it was declared. */
export function mustBeVerified(status: Status): void {
  if (status !== 'verified') {
    throw new ApiError({
      code: 'upload_rejected',
      status: 0,
      title: 'A file did not arrive as it was sent',
    });
  }
}
