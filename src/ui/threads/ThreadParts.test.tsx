import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import type { Clarification } from '@/api/types';
import { renderWithProviders } from '@/test/render';
import { QuestionThread } from './ThreadParts';

const ASKED = '2026-09-12T09:10:00Z';

const question: Clarification = {
  contest: { org: 'acme', contest: 'spring', task: null },
  asker: '20',
  number: 1,
  task: null,
  title: 'Input size?',
  body: 'How big is n?',
  asked_at: ASKED,
  answered: false,
  closed: false,
  messages: [],
};

describe("an open question's badge, for its organisers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts on how long the question has waited while the page stays open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(Date.parse(ASKED) + 2 * 60_000));
    renderWithProviders(
      <QuestionThread clarification={question} asker="Red" organisers />,
    );
    expect(screen.getByText('Open, waiting 2 minutes')).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60_000);
    });
    expect(screen.getByText('Open, waiting 1 hour')).toBeVisible();
  });
});
