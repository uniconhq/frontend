import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { VerdictBadge } from './VerdictBadge';
import type { Verdict } from './verdicts';

const EVERY: [Verdict, string][] = [
  ['accepted', 'ACCEPTED'],
  ['wrong_answer', 'WRONG ANSWER'],
  ['time_limit', 'TIME LIMIT'],
  ['memory_limit', 'MEMORY LIMIT'],
  ['output_limit', 'OUTPUT LIMIT'],
  ['runtime_error', 'RUNTIME ERROR'],
  ['compile_error', 'COMPILE ERROR'],
  ['skipped', 'NOT GIVEN'],
  ['system_error', 'SYSTEM ERROR'],
  ['queued', 'QUEUED'],
  ['dispatched', 'STARTING'],
  ['running', 'RUNNING'],
  ['done', 'GRADED'],
  ['cancelled', 'CANCELLED'],
  ['over_limit', 'OVER THE LIMIT'],
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
