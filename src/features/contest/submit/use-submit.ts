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
import { sendToStore } from './transfer';

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

/** Where a submit is: not sending, sending the files, or asking for the submission. */
export type Phase = 'idle' | 'uploading' | 'submitting';

/**
 * Refusals after which the files already sent cannot be used again, so the
 * next attempt sends them afresh.
 */
const SEND_AGAIN = new Set([
  'upload_failed',
  'upload_rejected',
  'upload_not_ready',
  'upload_not_yours',
]);

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
 * refusal says they cannot be used.
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
  const uploaded = useRef(new Map<string, Map<File, string>>());
  const uploadOf = (input: string, file: File) =>
    uploaded.current.get(input)?.get(file);

  const path = { org, contest, task };

  const upload = async (input: ContestantInput, file: File): Promise<string> => {
    const slot = await requestSlot.mutateAsync({
      params: { path },
      body: {
        input: input.id,
        filename: file.name,
        size: file.size,
        content_type: file.type === '' ? null : file.type,
      },
    });
    const parts = await sendToStore(slot, file, (share) =>
      setSent((current) => new Map(current).set(file, Math.round(share * 100))),
    );
    const arrived = await complete.mutateAsync({
      params: { path: { ...path, upload: slot.id } },
      body: { parts },
    });
    if (arrived.status !== 'verified') {
      throw new ApiError({
        code: 'upload_rejected',
        status: 0,
        title: 'A file did not arrive as it was sent',
      });
    }
    return slot.id;
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
        const made = await upload(input, file);
        const forInput = uploaded.current.get(input.id) ?? new Map<File, string>();
        uploaded.current.set(input.id, forInput.set(file, made));
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
      return submission;
    } catch (error) {
      const refused = toApiError(error);
      if (SEND_AGAIN.has(refused.code)) uploaded.current = new Map();
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
    clearRefusal: () => setRefusal(null),
  };
}
