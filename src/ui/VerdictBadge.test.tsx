import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { VerdictBadge } from './VerdictBadge';
import type { Verdict } from './verdicts';

const EVERY: [Verdict, string][] = [
  ['accepted', 'ACCEPTED'],
  ['partial', 'PARTIAL'],
  ['wrong_answer', 'WRONG ANSWER'],
  ['time_limit', 'TIME LIMIT'],
  ['memory_limit', 'MEMORY LIMIT'],
  ['output_limit', 'OUTPUT LIMIT'],
  ['runtime_error', 'RUNTIME ERR'],
  ['compile_error', 'COMPILE ERR'],
  ['skipped', 'SKIPPED'],
  ['system_error', 'SYSTEM ERR'],
  ['queued', 'QUEUED'],
  ['dispatched', 'STARTING'],
  ['running', 'RUNNING'],
  ['done', 'GRADED'],
  ['cancelled', 'CANCELLED'],
];

describe('VerdictBadge', () => {
  it.each(EVERY)('always ships the label with the colour: %s', (verdict, label) => {
    renderWithProviders(<VerdictBadge verdict={verdict} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows an outcome it does not know under its own name', () => {
    renderWithProviders(<VerdictBadge verdict="presentation_error" />);

    expect(screen.getByText('PRESENTATION ERROR')).toBeInTheDocument();
  });
});
