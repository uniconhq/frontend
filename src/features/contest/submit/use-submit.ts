import { useRef, useState } from 'react';
import { $api } from '@/api/query';
import { ApiError, toApiError } from '@/api/problem';
import type { ContestantInput, Submission } from '@/api/types';
import {
  checkDraft,
  filesOf,
  submittedInputs,
  takesFiles,
  type Draft,
  type PanelInput,
} from './draft';
import { digestOf } from './digest';
import { sendToForge } from './transfer';

/**
 * A fresh idempotency key. `randomUUID` is there only on a secure origin, and
 * a contest on a hall's own network may be served over plain http, so the key
 * falls back to 32 random hex digits, which the server takes the same.
 */
function newKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Where a submit is: not sending, working out what the files hash to, sending
 * them, or asking for the submission. Hashing is its own phase because a
 * large file takes seconds to read through and the panel has to say so rather
 * than look stuck.
 */
export type Phase = 'idle' | 'hashing' | 'uploading' | 'submitting';

/**
 * Refusals of a submit after which the uploads it names cannot be used
 * again, so the next attempt sends those files afresh: the ones the
 * refusal lists, or every one when it lists none.
 */
const SEND_AGAIN = new Set(['upload_not_ready', 'upload_not_yours']);

/** A slot asked for and not yet known to hold its file. */
type Slot = { id: string; url: string | null };

/** One value per file, by the input it is for. */
type ByInput<T> = Map<string, Map<File, T>>;

function put<T>(by: ByInput<T>, input: string, file: File, value: T) {
  by.set(input, (by.get(input) ?? new Map<File, T>()).set(file, value));
}

function unreadable(): ApiError {
  return new ApiError({
    code: 'upload_failed',
    status: 0,
    title: 'The file could not be read',
  });
}

/**
 * Submits a draft: the browser's own checks, then a slot, the bytes and the
 * completion for each file in turn, then the submit naming every upload.
 *
 * One idempotency key is made per attempt, an attempt being one draft: a
 * second click while one is under way does nothing, and sending the same
 * draft again, after a lost answer or a refusal, sends the same key, so the
 * server answers with the submission it made, if it made one, and makes no
 * second. Any change to the draft is a new attempt with a new key. Files that
 * went up and checked out are not sent again within the attempt, unless a
 * refusal says they cannot be used. A file whose sending failed keeps its
 * slot, and the next attempt asks whether the bytes arrived after all and
 * otherwise sends them to the same slot, so a retry takes nothing more from
 * the person's allowance; only when that slot fails as well is a new one
 * asked for.
 *
 * A refusal ends the attempt's progress, whatever stage it came at, so the
 * panel never shows a half-sent file: the files stay in the draft, the
 * refusal is `refusal`, and the next submit starts over from the checks.
 */
export function useSubmit({
  org,
  contest,
  task,
  inputs,
  maxSize,
}: {
  org: string;
  contest: string;
  task: string;
  inputs: PanelInput[];
  maxSize: number;
}) {
  const requestSlot = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/uploads',
  );
  const complete = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/uploads/{upload}/complete',
  );
  const create = $api.useMutation(
    'post',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/submissions',
  );

  const [phase, setPhase] = useState<Phase>('idle');
  const [sent, setSent] = useState<ReadonlyMap<File, number>>(new Map());
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const busy = useRef(false);
  const attempt = useRef<{ draft: Draft; key: string } | null>(null);
  /** The upload each file went up as, by the input it was sent for. */
  const uploaded = useRef<ByInput<string>>(new Map());
  const uploadOf = (input: string, file: File) =>
    uploaded.current.get(input)?.get(file);
  /** Slots whose file has not been seen to arrive yet. */
  const pending = useRef<ByInput<Slot>>(new Map());

  const path = { org, contest, task };

  const progress = (file: File, share: number) =>
    setSent((current) => new Map(current).set(file, Math.round(share * 100)));

  const newSlot = async (input: ContestantInput, file: File): Promise<Slot> => {
    setPhase('hashing');
    let sha256: string;
    try {
      sha256 = await digestOf(file, (share) => progress(file, share));
    } catch {
      throw unreadable();
    }
    setPhase('uploading');
    progress(file, 0);
    const made = await requestSlot.mutateAsync({
      params: { path },
      body: {
        input: input.id,
        filename: file.name,
        size: file.size,
        sha256,
        content_type: file.type === '' ? null : file.type,
      },
    });
    const slot = { id: made.id, url: made.url };
    put(pending.current, input.id, file, slot);
    return slot;
  };

  /** Where the slot's upload stands, or null while its bytes are not there. */
  const arrival = async (slot: Slot): Promise<string | null> => {
    try {
      const arrived = await complete.mutateAsync({
        params: { path: { ...path, upload: slot.id } },
      });
      return arrived.status;
    } catch (error) {
      if (toApiError(error).code === 'upload_not_ready') return null;
      throw error;
    }
  };

  const upload = async (input: ContestantInput, file: File): Promise<string> => {
    const kept = pending.current.get(input.id)?.get(file);
    const slot = kept ?? (await newSlot(input, file));
    setPhase('uploading');
    // A kept slot's bytes may have arrived after all, and the forge may
    // already hold a new slot's file, from an earlier submit or someone
    // else's: then there is nothing to send.
    let status = kept === undefined ? null : await arrival(slot);
    if (status === null) {
      try {
        if (slot.url !== null) {
          await sendToForge(slot.url, file, (share) => progress(file, share));
        }
        progress(file, 1);
        const arrived = await complete.mutateAsync({
          params: { path: { ...path, upload: slot.id } },
        });
        status = arrived.status;
      } catch (error) {
        if (kept !== undefined) pending.current.get(input.id)?.delete(file);
        throw error;
      }
    }
    pending.current.get(input.id)?.delete(file);
    if (status !== 'verified') {
      throw new ApiError({
        code: 'upload_rejected',
        status: 0,
        title: 'A file did not arrive as it was sent',
      });
    }
    progress(file, 1);
    return slot.id;
  };

  /**
   * Drops the uploads a refusal names, or every one when it names none of
   * the uploads this attempt holds.
   */
  const forgetUploads = (refused: ApiError) => {
    const named = refused.extensions.uploads;
    const held = [...uploaded.current.values()].flatMap((forInput) => [...forInput]);
    const dropped = held.filter(([, id]) => Array.isArray(named) && named.includes(id));
    if (dropped.length === 0) {
      uploaded.current = new Map();
      return;
    }
    for (const forInput of uploaded.current.values()) {
      for (const [file] of dropped) forInput.delete(file);
    }
  };

  const submit = async (draft: Draft): Promise<Submission | null> => {
    if (busy.current) return null;
    busy.current = true;
    setRefusal(null);
    try {
      const local = checkDraft(inputs, draft, maxSize);
      if (local !== null) {
        setRefusal(local);
        return null;
      }
      if (attempt.current?.draft !== draft) {
        attempt.current = { draft, key: newKey() };
      }
      const { key } = attempt.current;

      const files = inputs
        .filter(takesFiles)
        .flatMap((input) => filesOf(draft, input).map((file) => ({ input, file })));
      setPhase('uploading');
      setSent(
        new Map(
          files.map(({ input, file }) => [
            file,
            uploadOf(input.id, file) === undefined ? 0 : 100,
          ]),
        ),
      );
      for (const { input, file } of files) {
        if (uploadOf(input.id, file) !== undefined) continue;
        put(uploaded.current, input.id, file, await upload(input, file));
      }

      setPhase('submitting');
      const submission = await create.mutateAsync({
        params: { path },
        body: {
          idempotency_key: key,
          inputs: submittedInputs(
            inputs,
            draft,
            (input, file) => uploadOf(input, file) ?? '',
          ),
        },
      });
      attempt.current = null;
      uploaded.current = new Map();
      pending.current = new Map();
      return submission;
    } catch (error) {
      const refused = toApiError(error);
      if (SEND_AGAIN.has(refused.code)) forgetUploads(refused);
      setRefusal(refused);
      return null;
    } finally {
      busy.current = false;
      setPhase('idle');
      setSent(new Map());
    }
  };

  return {
    submit,
    phase,
    /** How much of each file has been sent, from 0 to 100, while a submit sends. */
    sentOf: (file: File): number | null => sent.get(file) ?? null,
    refusal,
  };
}
