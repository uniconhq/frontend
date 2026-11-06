import { useRef, useState } from 'react';
import { $api } from '@/api/query';
import { type ApiError, toApiError } from '@/api/problem';
import { arrival, hashOf, mustBeVerified, sendAndComplete } from '@/api/upload/door';
import { wasCut } from '@/api/upload/transfer';
import type { InputField, Submission, Upload } from '@/api/types';
import { checkDraft, pathOf, submittedInputs, uploadsOf, type Draft } from './draft';

// `randomUUID` needs a secure origin; a hall's own network may serve plain http.
function newKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Hashing is its own phase: a large file takes seconds, and the panel says so. */
export type Phase = 'idle' | 'hashing' | 'uploading' | 'resending' | 'submitting';

/** Sends of one file before a cut connection is given up on. */
const SEND_TRIES = 3;

/** Refusals after which the named uploads (or all, if none named) are sent afresh. */
const SEND_AGAIN = new Set(['upload_not_ready', 'upload_not_yours']);

/** A slot asked for and not yet known to hold its file. */
type Slot = { id: string; url: string | null };

type ByInput<T> = Map<string, Map<File, T>>;

function put<T>(by: ByInput<T>, input: string, file: File, value: T) {
  by.set(input, (by.get(input) ?? new Map<File, T>()).set(file, value));
}

/**
 * One idempotency key per draft, so resending the same draft makes no second
 * submission. A failed file keeps its slot, so a retry costs no allowance.
 */
export function useSubmit({
  org,
  contest,
  task,
  inputs,
}: {
  org: string;
  contest: string;
  task: string;
  inputs: InputField[];
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
  const uploaded = useRef<ByInput<string>>(new Map());
  const uploadOf = (input: string, file: File) =>
    uploaded.current.get(input)?.get(file);
  /** Slots whose file has not been seen to arrive yet. */
  const pending = useRef<ByInput<Slot>>(new Map());

  const path = { org, contest, task };

  const progress = (file: File, share: number) =>
    setSent((current) => new Map(current).set(file, Math.round(share * 100)));

  const newSlot = async (
    input: InputField,
    file: File,
    part: number | null,
  ): Promise<Slot> => {
    setPhase('hashing');
    const sha256 = await hashOf(file, (share) => progress(file, share));
    setPhase('uploading');
    progress(file, 0);
    const made = await requestSlot.mutateAsync({
      params: { path },
      body: {
        input: input.id,
        filename: pathOf(input, file),
        size: file.size,
        sha256,
        content_type: file.type === '' ? null : file.type,
        ...(part === null ? {} : { part }),
      },
    });
    const slot = { id: made.id, url: made.url };
    put(pending.current, input.id, file, slot);
    return slot;
  };

  const completeSlot = (slot: Slot) => () =>
    complete.mutateAsync({ params: { path: { ...path, upload: slot.id } } });

  const sendUntilThere = async (slot: Slot, file: File, kept: boolean) => {
    for (let send = 1; ; send += 1) {
      // The bytes may have arrived after all, or the forge already holds the file.
      const arrived = kept || send > 1 ? await arrival(completeSlot(slot)) : null;
      if (arrived !== null) return arrived;
      progress(file, 0);
      try {
        return await sendAndComplete(
          slot,
          file,
          (share) => progress(file, share),
          completeSlot(slot),
        );
      } catch (error) {
        if (!wasCut(error) || send >= SEND_TRIES) throw error;
        setPhase('resending');
      }
    }
  };

  const upload = async (
    input: InputField,
    file: File,
    part: number | null,
  ): Promise<string> => {
    const kept = pending.current.get(input.id)?.get(file);
    const slot = kept ?? (await newSlot(input, file, part));
    setPhase('uploading');
    let status: Upload['status'];
    try {
      status = await sendUntilThere(slot, file, kept !== undefined);
    } catch (error) {
      if (kept !== undefined) pending.current.get(input.id)?.delete(file);
      throw error;
    }
    pending.current.get(input.id)?.delete(file);
    mustBeVerified(status);
    progress(file, 1);
    return slot.id;
  };

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
      const local = checkDraft(inputs, draft);
      if (local !== null) {
        setRefusal(local);
        return null;
      }
      if (attempt.current?.draft !== draft) {
        attempt.current = { draft, key: newKey() };
      }
      const { key } = attempt.current;

      const files = uploadsOf(inputs, draft);
      setPhase('uploading');
      setSent(
        new Map(
          files.map(({ input, file }) => [
            file,
            uploadOf(input.id, file) === undefined ? 0 : 100,
          ]),
        ),
      );
      for (const { input, file, part } of files) {
        if (uploadOf(input.id, file) !== undefined) continue;
        put(uploaded.current, input.id, file, await upload(input, file, part));
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
    /** 0 to 100. */
    sentOf: (file: File): number | null => sent.get(file) ?? null,
    refusal,
  };
}
