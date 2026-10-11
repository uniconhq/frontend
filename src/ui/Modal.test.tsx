import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { renderWithProviders } from '@/test/render';
import { Modal } from './Modal';

describe('a dialog', () => {
  it('has a close button a screen reader can name, which closes it', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <Modal opened onClose={onClose} title="New org">
        <p>Inside</p>
      </Modal>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'New org' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
