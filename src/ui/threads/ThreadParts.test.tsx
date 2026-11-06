import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { question } from '@/test/server';
import { QuestionThread } from './ThreadParts';

const ASKED = '2026-09-12T09:10:00Z';

describe("an open question's badge, for its organisers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts on how long the question has waited while the page stays open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(Date.parse(ASKED) + 2 * 60_000));
    renderWithProviders(
      <QuestionThread
        clarification={question({ asked_at: ASKED })}
        asker="Red"
        organisers
      />,
    );
    expect(screen.getByText('Open, waiting 2 minutes')).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60_000);
    });
    expect(screen.getByText('Open, waiting 1 hour')).toBeVisible();
  });
});
