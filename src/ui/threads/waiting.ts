import type { Clarification } from '@/api/types';

/**
 * Since when an open question has waited for the organisers: from the
 * asker's first message after the organisers last wrote, or from its asking
 * while they have written nothing. Null once the organisers wrote last, when
 * it waits on nobody.
 */
export function waitingSince(clarification: Clarification): string | null {
  const { messages } = clarification;
  const lastReply = messages.findLastIndex((message) => !message.from_asker);
  if (lastReply < 0) return clarification.asked_at;
  return (
    messages.slice(lastReply + 1).find((message) => message.from_asker)?.at ?? null
  );
}

/** How long something has waited, in a word or two: "5 minutes", "2 hours", "3 days". */
export function waitedWords(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const count = (n: number, unit: string) =>
    `${String(n)} ${unit}${n === 1 ? '' : 's'}`;
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return count(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return count(hours, 'hour');
  return count(Math.floor(hours / 24), 'day');
}
