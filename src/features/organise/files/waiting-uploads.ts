import { createContext, useContext } from 'react';
import type { ArrivedUpload } from './upload-save';

/**
 * The uploads that have arrived and wait to be saved into the task together,
 * kept in the page's own state only: leaving or reloading the page drops
 * them, and the task never had them. `held` counts the upload forms holding
 * an arrived upload of their own, whose Save takes the waiting ones with it.
 */
export type Waiting = {
  uploads: ArrivedUpload[];
  /** Adds an upload, in place of one waiting for the same path. */
  keep: (upload: ArrivedUpload) => void;
  discard: (path: string) => void;
  /** Takes out the uploads a save put into the task. */
  saved: (paths: string[]) => void;
  held: number;
  hold: (on: boolean) => void;
};

export const WaitingContext = createContext<Waiting | null>(null);

/** The waiting uploads of a task's files, or null where a page keeps none. */
export function useWaitingUploads(): Waiting | null {
  return useContext(WaitingContext);
}
