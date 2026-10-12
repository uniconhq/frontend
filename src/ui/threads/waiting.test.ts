import { describe, expect, it } from 'vitest';
import type { Clarification } from '@/api/types';
import { waitedWords, waitingSince } from './waiting';

function asked(messages: Clarification['messages']): Clarification {
  return {
    contest: { org: 'acme', contest: 'spring', task: null },
    asker: '20',
    number: 1,
    task: null,
    title: 'Input size?',
    body: 'How big is n?',
    asked_at: '2026-09-12T09:00:00Z',
    answered: false,
    closed: false,
    messages,
  };
}

const at = (time: string, fromAsker: boolean) => ({
  at: `2026-09-12T${time}:00Z`,
  body: 'text',
  from_asker: fromAsker,
});

describe('how long an open question has waited', () => {
  it('waits from its asking while the organisers have written nothing', () => {
    expect(waitingSince(asked([at('09:10', true)]))).toBe('2026-09-12T09:00:00Z');
  });

  it('waits from the asker’s first message after the organisers last wrote', () => {
    expect(
      waitingSince(asked([at('09:10', false), at('09:20', true), at('09:30', true)])),
    ).toBe('2026-09-12T09:20:00Z');
  });

  it('waits on nobody once the organisers wrote last', () => {
    expect(waitingSince(asked([at('09:10', true), at('09:20', false)]))).toBeNull();
  });

  it('says it in a word or two', () => {
    expect(waitedWords(30_000)).toBe('under a minute');
    expect(waitedWords(60_000)).toBe('1 minute');
    expect(waitedWords(59 * 60_000)).toBe('59 minutes');
    expect(waitedWords(2 * 3_600_000)).toBe('2 hours');
    expect(waitedWords(47 * 3_600_000)).toBe('47 hours');
    expect(waitedWords(3 * 86_400_000)).toBe('3 days');
  });
});
