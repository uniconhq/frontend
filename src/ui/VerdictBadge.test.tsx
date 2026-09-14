import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { VerdictBadge } from './VerdictBadge';

describe('VerdictBadge', () => {
  it('always ships the label with the colour', () => {
    renderWithProviders(<VerdictBadge verdict="rejected" />);

    expect(screen.getByText('WRONG ANSWER')).toBeInTheDocument();
  });
});
