import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { BoardTable } from './BoardTable';

describe('a leaderboard table', () => {
  it('says the page is being rebuilt', () => {
    renderWithProviders(<BoardTable />);
    expect(screen.getByText('This page is being rebuilt.')).toBeVisible();
  });
});
