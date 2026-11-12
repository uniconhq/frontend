import { startCompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { FormulaCard } from './FormulaCard';
import { specCatalogue } from '@/test/catalogue';
import type { FormulaScope } from './parse';

const scope: FormulaScope = { where: 'task', names: ['late'], sets: [], each: [] };
const names = new Map([['late', { kind: 'fact', description: 'Seconds late' }]]);
function card(value: string, disabled = false) {
  return (
    <FormulaCard
      disabled={disabled}
      head={<h3>Points</h3>}
      label="points"
      name="points"
      value={value}
      onChange={() => undefined}
      scope={scope}
      catalogue={specCatalogue()}
      names={names}
    />
  );
}
it('opens tiles only while the line is focused and puts its flow below them', () => {
  renderWithProviders(card('late'));
  expect(screen.queryByRole('heading', { name: 'Many into one' })).toBeNull();
  const line = screen.getByRole('textbox', { name: 'points' });
  fireEvent.focus(line);
  const tray = screen.getByRole('heading', { name: 'Many into one' });
  const box = screen.getByRole('img', { name: /late fact/ });
  expect(
    tray.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.blur(line, { relatedTarget: document.body });
  expect(screen.queryByRole('heading', { name: 'Many into one' })).toBeNull();
});
it('keeps the last flow, dimmed, while a line cannot parse', () => {
  const rendered = renderWithProviders(card('late'));
  rendered.rerender(card('late +'));
  const box = screen.getByRole('img', { name: /late fact/ });
  expect(box.closest('[data-stale]')).toBeInTheDocument();
});
it('explains a constant line', () => {
  renderWithProviders(card('1'));
  expect(screen.getByText('Reads nothing: it is always the same.')).toBeVisible();
});

it('shows a card’s problem in place of the formula’s words', () => {
  renderWithProviders(
    <FormulaCard
      head={<h3>Points</h3>}
      label="points"
      name="points"
      value="1"
      onChange={() => undefined}
      scope={scope}
      catalogue={specCatalogue()}
      names={names}
      trouble="Fix the name first."
    />,
  );
  expect(screen.getByText('Fix the name first.')).toBeVisible();
  expect(screen.queryByText('1', { selector: '[class*=formulaHint]' })).toBeNull();
});

it('keeps a disabled formula readable without a tray and updates when permission changes', () => {
  const rendered = renderWithProviders(card('late'));
  const line = screen.getByRole('textbox', { name: 'points' });
  expect(line).toHaveAttribute('contenteditable', 'true');
  rendered.rerender(card('late', true));
  expect(line).toHaveAttribute('contenteditable', 'false');
  expect(line).toHaveAttribute('aria-readonly', 'true');
  fireEvent.focus(line);
  expect(screen.queryByRole('heading', { name: 'Many into one' })).toBeNull();
  expect(screen.getByRole('img', { name: /late fact/ })).toBeVisible();
});

it('closes existing completion and refuses document edits after being disabled', async () => {
  const rendered = renderWithProviders(card('la'));
  const line = screen.getByRole('textbox', { name: 'points' });
  const view = EditorView.findFromDOM(line);
  if (view === null) throw new Error('The formula line has an editor.');
  act(() => {
    line.focus();
    startCompletion(view);
  });
  await waitFor(() => expect(screen.getByRole('listbox')).toBeVisible());
  rendered.rerender(card('la', true));
  expect(screen.queryByRole('listbox')).toBeNull();
  act(() => view.dispatch({ changes: { from: 0, to: 2, insert: 'late' } }));
  expect(view.state.doc.toString()).toBe('la');
  rendered.rerender(card('late', true));
  expect(view.state.doc.toString()).toBe('late');
});
