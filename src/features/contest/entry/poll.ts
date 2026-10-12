import type { MyEntry } from '@/api/types';

/**
 * How often the contest's home is read again for the caller's entry: soon
 * while they wait on an organiser or on an invite, now and then otherwise.
 */
const WAITING_MS = 10_000;
const MEANWHILE_MS = 60_000;

export function entryPollEvery(entry: MyEntry | undefined): number {
  if (entry === undefined) return MEANWHILE_MS;
  const waiting =
    entry.entrant?.status === 'pending' ||
    entry.invitations.length > 0 ||
    (entry.entrant?.invites.length ?? 0) > 0;
  return waiting ? WAITING_MS : MEANWHILE_MS;
}
